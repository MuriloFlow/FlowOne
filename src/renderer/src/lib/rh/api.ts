// API do PORTAL DO RH — PostgREST/Storage direto do renderer com o token do
// usuário logado. As policies RLS (rh_is_admin) garantem que só perfil FLOW
// ativo lê/escreve os dados internos; o público só vê vagas abertas.
import { supabase } from "@/lib/supabase";
import { currentAccessToken } from "@/lib/auth";
import { callOp } from "@/lib/flow-ops-client";
import { loadPdfJs } from "@/lib/rh/pdf";
import type {
  RhAiAssessment,
  RhAiRule,
  RhAnswer,
  RhApplication,
  RhApplicationStatus,
  RhCriterion,
  RhInterview,
  RhInternalNote,
  RhJob,
  RhOption,
  RhQuestion,
} from "./types";

export class RhApiError extends Error {}

async function ensureSession(): Promise<void> {
  // Token expirado: getSession já faz autoRefreshToken; força uma volta ao
  // token atual para as queries abaixo.
  if (!currentAccessToken())
    await supabase.auth.getSession().catch(() => undefined);
}

async function fatal(
  error: { message: string },
  fallback: string,
): Promise<never> {
  throw new RhApiError(error?.message?.trim() || fallback);
}

// ---------------- Jobs ----------------

export async function fetchJobs(): Promise<RhJob[]> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_jobs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return fatal(error, "Erro ao carregar vagas.");
  return (data ?? []) as RhJob[];
}

export async function fetchJobApplicationsCounts(): Promise<
  Record<string, number>
> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_applications")
    .select("job_id");
  if (error) return fatal(error, "Erro ao carregar candidaturas.");
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { job_id: string }[]) {
    counts[row.job_id] = (counts[row.job_id] ?? 0) + 1;
  }
  return counts;
}

export type RhJobInput = {
  title: string;
  department?: string | null;
  location?: string | null;
  work_model?: string;
  employment_type?: RhJob["employment_type"];
  contract_type?: string;
  status?: RhJob["status"];
  description?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  salary_visible?: boolean;
  openings?: number;
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createJob(input: RhJobInput): Promise<RhJob> {
  await ensureSession();
  const uniqueSuffix = Math.random().toString(36).slice(2, 7);
  const { data, error } = await supabase
    .from("rh_jobs")
    .insert({
      ...input,
      slug: `${slugify(input.title) || "vaga"}-${uniqueSuffix}`,
    })
    .select("*")
    .single();
  if (error) return fatal(error, "Erro ao criar vaga.");
  return data as RhJob;
}

export async function updateJob(
  id: string,
  input: Partial<RhJobInput>,
): Promise<RhJob> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_jobs")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return fatal(error, "Erro ao salvar a vaga.");
  return data as RhJob;
}

export async function deleteJob(id: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase.from("rh_jobs").delete().eq("id", id);
  if (error) return fatal(error, "Erro ao excluir a vaga.");
}

// ---------------- Questions ----------------

export type RhQuestionWithMeta = RhQuestion & {
  rh_options?: RhOption[] | null;
};

export async function fetchQuestions(): Promise<RhQuestionWithMeta[]> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_questions")
    .select("*, rh_options(*)")
    .order("scope", { ascending: true })
    .order("order_index", { ascending: true });
  if (error) return fatal(error, "Erro ao carregar perguntas.");
  return (data ?? []) as RhQuestionWithMeta[];
}

export type RhQuestionInput = {
  scope: "GLOBAL" | "JOB";
  job_id?: string | null;
  type: RhQuestion["type"];
  label: string;
  placeholder?: string | null;
  help_text?: string | null;
  required: boolean;
  order_index: number;
  active: boolean;
  options?: RhOption[] | null;
  /** Preenchido apenas quando type = BOOLEAN (true_points). */
  true_points?: number;
};

export async function createQuestion(
  input: RhQuestionInput,
): Promise<RhQuestion> {
  await ensureSession();
  const { options, true_points, ...row } = input;
  const { data, error } = await supabase
    .from("rh_questions")
    .insert(row)
    .select("*")
    .single();
  if (error) return fatal(error, "Erro ao criar pergunta.");
  const question = data as RhQuestion;
  if (true_points !== undefined) {
    await supabase
      .from("rh_questions")
      .update({ options: { true_points } })
      .eq("id", question.id);
  }
  if (options && options.length > 0) await replaceOptions(question.id, options);
  return { ...question, options: options ?? null };
}

export async function updateQuestion(
  id: string,
  input: Partial<RhQuestionInput>,
): Promise<void> {
  await ensureSession();
  const { options, true_points, ...rest } = input;
  const patch: Record<string, unknown> = {
    ...rest,
    updated_at: new Date().toISOString(),
  };
  if (true_points !== undefined) patch.options = { true_points };
  const { error } = await supabase
    .from("rh_questions")
    .update(patch)
    .eq("id", id);
  if (error) return fatal(error, "Erro ao salvar a pergunta.");
  if (options) await replaceOptions(id, options);
}

export async function deleteQuestion(id: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase.from("rh_questions").delete().eq("id", id);
  if (error) return fatal(error, "Erro ao excluir a pergunta.");
}

export async function replaceOptions(
  questionId: string,
  options: RhOption[],
): Promise<void> {
  await ensureSession();
  const { error: deleteError } = await supabase
    .from("rh_options")
    .delete()
    .eq("question_id", questionId);
  if (deleteError) return fatal(deleteError, "Erro ao salvar as opções.");
  if (options.length === 0) return;
  const { error } = await supabase.from("rh_options").insert(
    options.map((option, index) => ({
      question_id: questionId,
      value: option.value,
      label: option.label,
      points: option.points,
      effect: option.effect,
      order_index: index,
    })),
  );
  if (error) return fatal(error, "Erro ao salvar as opções.");
}

// ---------------- Applications ----------------

const APPLICATION_SELECT =
  "*, job:rh_jobs(*), candidate:rh_candidates(*), rh_files(*)" as const;

export async function fetchApplications(
  jobId?: string | null,
): Promise<RhApplication[]> {
  await ensureSession();
  let query = supabase.from("rh_applications").select(APPLICATION_SELECT);
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("score", { ascending: false });
  if (error) return fatal(error, "Erro ao carregar candidaturas.");
  return (data ?? []) as unknown as RhApplication[];
}

export type RhApplicationDetail = {
  application: RhApplication;
  answers: RhAnswer[];
  history: RhStatusEventAlias[];
  notes: RhInternalNote[];
  interviews: RhInterview[];
  assessment: RhAiAssessment | null;
};

type RhStatusEventAlias = {
  id: string;
  application_id: string;
  from_status: RhApplicationStatus | null;
  to_status: RhApplicationStatus;
  actor_type: "ADMIN" | "SYSTEM";
  actor_id: string | null;
  note: string | null;
  created_at: string;
};

export async function fetchApplicationDetail(
  id: string,
): Promise<RhApplicationDetail | null> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_applications")
    .select(APPLICATION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return fatal(error, "Erro ao carregar o candidato.");
  if (!data) return null;

  const [answers, history, notes, interviews, assessments] = await Promise.all([
    supabase
      .from("rh_answers")
      .select("*, rh_questions(label, type)")
      .eq("application_id", id)
      .order("answered_at", { ascending: true }),
    supabase
      .from("rh_status_history")
      .select("*")
      .eq("application_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("rh_internal_notes")
      .select("*")
      .eq("application_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("rh_interviews")
      .select("*")
      .eq("application_id", id)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("rh_ai_assessments")
      .select("*")
      .eq("application_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  return {
    application: data as unknown as RhApplication,
    answers: (answers.data ?? []) as unknown as RhAnswer[],
    history: (history.data ?? []) as unknown as RhStatusEventAlias[],
    notes: (notes.data ?? []) as RhInternalNote[],
    interviews: (interviews.data ?? []) as RhInterview[],
    assessment:
      ((assessments.data ?? [])[0] as RhAiAssessment | undefined) ?? null,
  };
}

export async function moveApplication(
  id: string,
  to: RhApplicationStatus,
  note?: string,
): Promise<void> {
  await ensureSession();
  const { data, error } = await supabase.rpc("rh_move_application", {
    p_application_id: id,
    p_to_status: to,
    p_note: note ?? null,
  });
  if (error) return fatal(error, "Erro ao alterar o status.");
  const result = data as { ok?: boolean } | null;
  if (result && result.ok === false)
    throw new RhApiError("Falha ao alterar o status.");
}

export async function addInternalNote(
  applicationId: string,
  content: string,
  authorName: string,
): Promise<void> {
  await ensureSession();
  const { error } = await supabase
    .from("rh_internal_notes")
    .insert({
      application_id: applicationId,
      content,
      author_name: authorName,
    });
  if (error) return fatal(error, "Erro ao salvar a observação.");
}

export async function deleteInternalNote(id: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase
    .from("rh_internal_notes")
    .delete()
    .eq("id", id);
  if (error) return fatal(error, "Erro ao excluir a observação.");
}

// ---------------- Interviews ----------------

export async function createInterview(input: {
  application_id: string;
  mode: "online" | "presencial";
  scheduled_at: string;
  duration_minutes: number;
  location?: string | null;
  meeting_url?: string | null;
  interviewer?: string | null;
  notes?: string | null;
}): Promise<RhInterview> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_interviews")
    .insert(input)
    .select("*")
    .single();
  if (error) return fatal(error, "Erro ao agendar a entrevista.");
  return data as RhInterview;
}

export async function updateInterview(
  id: string,
  input: Partial<{
    mode: "online" | "presencial";
    scheduled_at: string;
    duration_minutes: number;
    location: string | null;
    meeting_url: string | null;
    interviewer: string | null;
    notes: string | null;
    result: string | null;
  }>,
): Promise<void> {
  await ensureSession();
  const { error } = await supabase
    .from("rh_interviews")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fatal(error, "Erro ao salvar a entrevista.");
}

export async function deleteInterview(id: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase.from("rh_interviews").delete().eq("id", id);
  if (error) return fatal(error, "Erro ao excluir a entrevista.");
}

export async function fetchInterviewsWithContext(): Promise<
  Array<RhInterview & { application: RhApplication | null }>
> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_interviews")
    .select(
      "*, application:rh_applications(id, status, job:rh_jobs(title), candidate:rh_candidates(full_name, phone))",
    )
    .order("scheduled_at", { ascending: true });
  if (error) return fatal(error, "Erro ao carregar entrevistas.");
  return (data ?? []) as unknown as Array<
    RhInterview & { application: RhApplication | null }
  >;
}

// ---------------- Branding (personalização do portal público) ----------------

export type RhBranding = {
  logo_url: string | null;
  theme: "dark" | "light";
  primary_color: string;
  secondary_color: string;
  footer_note: string;
};

export async function fetchBranding(): Promise<RhBranding> {
  await ensureSession();
  const { data, error } = await supabase
    .from("flow_branding")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) return fatal(error, "Erro ao carregar a personalização.");
  return {
    logo_url: (data?.logo_url as string | null) ?? null,
    theme: (data?.theme as RhBranding["theme"]) ?? "light",
    primary_color: (data?.primary_color as string) ?? "#2EC97E",
    secondary_color: (data?.secondary_color as string) ?? "#101014",
    footer_note:
      (data?.footer_note as string) ?? "RH Inteligente by Flowdesk Brasil®",
  };
}

export async function saveBranding(input: RhBranding): Promise<void> {
  await ensureSession();
  const { error } = await supabase
    .from("flow_branding")
    .update({
      logo_url: input.logo_url,
      theme: input.theme,
      primary_color: input.primary_color,
      secondary_color: input.secondary_color,
      footer_note: input.footer_note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return fatal(error, "Erro ao salvar a personalização.");
}

/**
 * Prepara a logo para salvar em flow_branding.logo_url como DATA URL.
 *
 * Antes subíamos em storage (rh-files/branding) — mas o bucket é privado e
 * exigia URL assinada no app e URL pública (404) nos sites; além disso o
 * upload dependia de policy de storage e falhava sem mensagem clara.
 * Gravando o data URL direto na tabela (mesma policy do save que já
 * funciona), o app E os portais públicos leem a logo sem storage.
 *
 * Imagens pequenas (< ~390KB) passam como vieram; maiores são reescala das
 * via canvas para até 512px (PNG preserva transparência; cai para JPEG se o
 * PNG ainda ficar grande demais).
 */
export async function prepareBrandingLogo(dataUrl: string): Promise<string> {
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) {
    throw new RhApiError("Formato de imagem inválido — use PNG, JPG, WebP ou SVG.");
  }
  // SVG não passa por canvas (pode não ter dimensões intrínsecas) e é leve.
  if (dataUrl.startsWith("data:image/svg")) return dataUrl;
  if (dataUrl.length < 520_000) return dataUrl; // < ~390KB em binário

  const decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new RhApiError(
          "Não foi possível processar a imagem — use PNG, JPG ou WebP.",
        ),
      );
    image.src = dataUrl;
  });

  const maxSide = 512;
  const ratio = Math.min(
    1,
    maxSide / Math.max(decoded.naturalWidth || 1, decoded.naturalHeight || 1),
  );
  const width = Math.max(1, Math.round((decoded.naturalWidth || 1) * ratio));
  const height = Math.max(1, Math.round((decoded.naturalHeight || 1) * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new RhApiError("Canvas indisponível neste dispositivo.");
  context.drawImage(decoded, 0, 0, width, height);

  const png = canvas.toDataURL("image/png");
  if (png.length < 1_200_000) return png; // preserva transparência
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(decoded, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

// ---------------- Pré-aprovados (fluxo de contratação) ----------------

/** Unidade fixa do formulário de cadastro enquanto não há multi-loja no RH. */
export const RH_FORM_STORE_NAME = "Loja 41";

/** Pré-aprovados = candidaturas com status "Contratado". */
export async function fetchPreApprovedApplications(): Promise<RhApplication[]> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_applications")
    .select(APPLICATION_SELECT)
    .eq("status", "hired")
    .order("updated_at", { ascending: false });
  if (error) return fatal(error, "Erro ao carregar pré-aprovados.");
  return (data ?? []) as unknown as RhApplication[];
}

/** Patch genérico do fluxo de onboarding (função, formulário, confirmação). */
export async function updateApplicationOnboarding(
  id: string,
  patch: Partial<{
    pre_hire_role: string | null;
    form_url_sent: boolean;
    form_url_sent_at: string | null;
    data_confirmed: boolean;
  }>,
): Promise<void> {
  await ensureSession();
  const { error } = await supabase
    .from("rh_applications")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fatal(error, "Erro ao salvar os dados de contratação.");
}

/**
 * Upload do RG frontal do pré-aprovado (pasta onb/ do bucket rh-files).
 * RLS: rh_files_admin_insert (rh_is_admin). Retorna o caminho gravado.
 */
export async function uploadPreHireDocument(
  applicationId: string,
  dataUrl: string,
): Promise<string> {
  await ensureSession();
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new RhApiError("Formato de imagem inválido.");
  const [, mime, base64] = match;
  const path = `onb/${applicationId}/rg-front-${Date.now()}.jpg`;
  const bytes = Uint8Array.from(atob(base64), (char) =>
    char.charCodeAt(0),
  );
  const { error } = await supabase.storage.from("rh-files").upload(path, bytes, {
    cacheControl: "3600",
    upsert: false,
    contentType: mime,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("too large"))
      throw new RhApiError("Imagem muito grande. Tente outra foto.");
    if (message.includes("mime"))
      throw new RhApiError("Formato não permitido. Envie JPG ou PNG.");
    throw new RhApiError("Não foi possível enviar a imagem do RG.");
  }
  return path;
}

// ---------------- Resume (currículo) ----------------

export async function createResumeSignedUrl(
  storagePath: string,
): Promise<string> {
  await ensureSession();
  const { data, error } = await supabase.storage
    .from("rh-files")
    .createSignedUrl(storagePath, 3600);
  if (error) return fatal(error, "Erro ao abrir o currículo.");
  return data.signedUrl;
}

/**
 * Download ROBUSTO do arquivo do currículo/RG.
 * Caminho primário: storage.download() — vai pelo supabase-js autenticado
 * (mesma origem, sem URL assinada para expirar/cors falhar).
 * Fallback: URL assinada + fetch (caso o download direto falhe).
 */
export async function downloadResumeFile(
  storagePath: string,
): Promise<{ data: ArrayBuffer; mime: string }> {
  await ensureSession();
  const { data, error } = await supabase.storage
    .from("rh-files")
    .download(storagePath);
  if (!error && data) {
    return {
      data: await data.arrayBuffer(),
      mime: data.type || "application/pdf",
    };
  }
  // Fallback 1: URL assinada.
  try {
    const signed = await createResumeSignedUrl(storagePath);
    const response = await fetch(signed);
    if (response.ok) {
      const blob = await response.blob();
      return {
        data: await blob.arrayBuffer(),
        mime: blob.type || "application/pdf",
      };
    }
  } catch {
    /* cai no erro abaixo */
  }
  // Fallback 2: URL assinada SEM query de download (alguns proxies trocam o
  // Content-Disposition e quebram o fetch com `download=name` na URL).
  try {
    const signed = await createResumeSignedUrl(storagePath);
    const clean = signed.split("?")[0];
    const retry = await fetch(clean, { credentials: "omit" });
    if (retry.ok) {
      const blob = await retry.blob();
      return {
        data: await blob.arrayBuffer(),
        mime: blob.type || "application/pdf",
      };
    }
  } catch {
    /* cai no erro abaixo */
  }
  throw new RhApiError(
    error?.message?.includes("not found")
      ? "Arquivo não encontrado no armazenamento — ele pode ter sido removido."
      : "Não foi possível baixar o arquivo. Verifique sua conexão e tente novamente.",
  );
}

// ---------------- Criteria (critérios avaliativos) ----------------

export async function fetchCriteria(): Promise<RhCriterion[]> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_criteria")
    .select("*")
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return fatal(error, "Erro ao carregar critérios.");
  return (data ?? []) as RhCriterion[];
}

export async function createCriterion(input: {
  job_id?: string | null;
  kind: "SCORE" | "DISQUALIFIER";
  label: string;
  points: number;
  order_index?: number;
}): Promise<void> {
  await ensureSession();
  const { error } = await supabase
    .from("rh_criteria")
    .insert({ order_index: 0, ...input });
  if (error) return fatal(error, "Erro ao criar critério.");
}

export async function updateCriterion(
  id: string,
  input: Partial<{
    kind: "SCORE" | "DISQUALIFIER";
    label: string;
    points: number;
    active: boolean;
    order_index: number;
  }>,
): Promise<void> {
  await ensureSession();
  const { error } = await supabase
    .from("rh_criteria")
    .update(input)
    .eq("id", id);
  if (error) return fatal(error, "Erro ao salvar o critério.");
}

export async function deleteCriterion(id: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase.from("rh_criteria").delete().eq("id", id);
  if (error) return fatal(error, "Erro ao excluir o critério.");
}

// ---------------- IA (regras + análise) ----------------

export async function fetchAiRules(): Promise<RhAiRule[]> {
  await ensureSession();
  const { data, error } = await supabase
    .from("rh_ai_rules")
    .select("*")
    .order("rule_key");
  if (error) return fatal(error, "Erro ao carregar as regras da IA.");
  return (data ?? []) as RhAiRule[];
}

export async function updateAiRule(
  id: string,
  config: Record<string, unknown>,
): Promise<void> {
  await ensureSession();
  const { error } = await supabase
    .from("rh_ai_rules")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fatal(error, "Erro ao salvar as regras da IA.");
}

/**
 * Regras adicionais escritas pelo RH (estilo prompt). Ficam na linha
 * custom_prompt_rules e entram no prompt da IA na análise.
 */
export async function savePromptRules(rules: string[]): Promise<void> {
  await ensureSession();
  const { error } = await supabase.from("rh_ai_rules").upsert(
    {
      rule_key: "custom_prompt_rules",
      label: "Instruções da IA (escritas pelo RH)",
      config: { rules },
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "rule_key" },
  );
  if (error) return fatal(error, "Erro ao salvar as instruções da IA.");
}

/**
 * Análise da IA: preferencialmente via LLM na edge (op rhAnalyzeApplication,
 * que usa as regras do banco + instruções do RH como prompt). Se a edge não
 * tiver OPENAI_API_KEY, cai para o motor de regras SQL (RPC rh_analyze_).
 */
export async function analyzeApplication(
  applicationId: string,
  resumeText?: string,
): Promise<RhAiAssessment> {
  await ensureSession();
  try {
    return await callOp<RhAiAssessment>("rhAnalyzeApplication", {
      applicationId,
      resumeText: resumeText ?? null,
    });
  } catch (edgeError) {
    const message = edgeError instanceof Error ? edgeError.message : "";
    const fallbackWorthy = /OPENAI|IA indispon|modelo|rate limit|429|503/i.test(
      message,
    );
    if (!fallbackWorthy) {
      // Mensagens técnicas → texto acionável para o RH.
      if (/permission denied/i.test(message))
        throw new RhApiError(
          "Sem permissão para analisar esta candidatura agora. Atualize o app e tente de novo.",
        );
      throw new RhApiError(message || "A análise da IA falhou.");
    }
    // fallback: motor de regras SQL
    const { data, error } = await supabase.rpc("rh_analyze_application", {
      p_application_id: applicationId,
      p_resume_text: resumeText ?? null,
    });
    if (error) return fatal(error, "A análise da IA falhou.");
    const result = data as { ok?: boolean } | null;
    if (result && result.ok === false)
      throw new RhApiError("A análise da IA não retornou resultado.");
  }
  const { data: row, error: readError } = await supabase
    .from("rh_ai_assessments")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return fatal(readError, "A análise da IA falhou.");
  return row as RhAiAssessment;
}

// ---------------- Extração de texto (PDF/DOCX) para a IA ----------------

/**
 * Extração de ALTA QUALIDADE para a IA:
 * - agrupa itens de texto por linha (y) para preservar parágrafos;
 * - reconstrói hífens de quebra ("expe- riência" → "experiência");
 * - mantém espaços que o PDF separa (colunas de tabela);
 * - limita em 80k caracteres (currículo inteiro entra com folga).
 */
export async function extractResumeTextFromBuffer(
  buffer: ArrayBuffer,
  mime: string,
): Promise<string> {
  if (mime.includes("pdf")) {
    // loadPdfJs registra o worker do pdf.js na main thread — obrigatório no
    // Electron empacotado (file://) e no WebView Android, onde new Worker
    // com URL de asset não funciona (sem isso a extração falha em silêncio).
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({
      data: buffer.slice(0),
      useSystemFonts: true,
    }).promise;
    let text = "";
    for (
      let page = 1;
      page <= doc.numPages && text.length < 80_000;
      page += 1
    ) {
      const pageContent = await doc.getPage(page);
      const content = await pageContent.getTextContent();
      // Agrupa itens por linha (mesmo y aproximado) e monta o parágrafo.
      type PdfItem = { str: string; transform: number[]; width: number };
      const items = (content.items as unknown[]).filter((item): item is PdfItem => {
        const candidate = item as { str?: unknown; transform?: unknown; width?: unknown };
        return (
          typeof candidate.str === "string" &&
          (candidate.str as string).length > 0 &&
          Array.isArray(candidate.transform)
        );
      });
      const lines = new Map<number, { y: number; parts: Array<{ x: number; str: string; end: number }> }>();
      for (const item of items) {
        const y = Math.round(item.transform[5] / 2) * 2;
        const x = item.transform[4];
        const end = x + item.width;
        const line = lines.get(y) ?? { y, parts: [] };
        line.parts.push({ x, str: item.str, end });
        lines.set(y, line);
      }
      const sorted = [...lines.values()].sort((a, b) => b.y - a.y);
      for (const line of sorted) {
        line.parts.sort((a, b) => a.x - b.x);
        let lineText = "";
        let previousEnd: number | null = null;
        for (const part of line.parts) {
          if (previousEnd !== null) {
            const gap = part.x - previousEnd;
            if (gap > 12) lineText += "  "; // coluna/tabela
            else if (gap > 1.5 && !/\s$/.test(lineText)) lineText += " ";
          }
          lineText += part.str;
          previousEnd = part.end;
        }
        text += lineText + "\n";
      }
      text += "\n";
    }
    // Reconstrói palavras quebradas por hífen no fim da linha.
    return text
      .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (mime.includes("wordprocessingml") || mime.includes("msword")) {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await (
      mammoth as unknown as {
        extractRawText: (input: {
          arrayBuffer: ArrayBuffer;
        }) => Promise<{ value: string }>;
      }
    ).extractRawText({ arrayBuffer: buffer });
    return result.value.trim();
  }
  return "";
}

// ---------------- Visão geral (dashboard) ----------------

export type RhDashboardStats = {
  totalApplications: number;
  byStatus: Record<RhApplicationStatus, number>;
  openJobs: number;
  totalJobs: number;
  newThisWeek: number;
  interviewsUpcoming: number;
  hiresTotal: number;
};

export async function fetchDashboardStats(): Promise<RhDashboardStats> {
  await ensureSession();
  const [apps, jobs, interviews] = await Promise.all([
    supabase.from("rh_applications").select("status, created_at"),
    supabase.from("rh_jobs").select("status"),
    supabase
      .from("rh_interviews")
      .select("scheduled_at")
      .gte("scheduled_at", new Date().toISOString()),
  ]);
  if (apps.error) return fatal(apps.error, "Erro ao carregar o painel.");
  const applicationRows = (apps.data ?? []) as Array<{
    status: RhApplicationStatus;
    created_at: string;
  }>;
  const jobRows = (jobs.data ?? []) as Array<{ status: RhJob["status"] }>;
  const byStatus = Object.fromEntries(
    (
      [
        "submitted",
        "viewed",
        "in_review",
        "interview_online_scheduled",
        "interview_presencial_scheduled",
        "approved",
        "rejected",
        "hired",
      ] as RhApplicationStatus[]
    ).map((status) => [status, 0]),
  ) as Record<RhApplicationStatus, number>;
  let newThisWeek = 0;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  for (const row of applicationRows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (new Date(row.created_at).getTime() > weekAgo) newThisWeek += 1;
  }
  return {
    totalApplications: applicationRows.length,
    byStatus,
    openJobs: jobRows.filter((job) => job.status === "open").length,
    totalJobs: jobRows.length,
    newThisWeek,
    interviewsUpcoming: interviews.data?.length ?? 0,
    hiresTotal: byStatus.hired ?? 0,
  };
}
