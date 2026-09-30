// API do PORTAL DO RH — PostgREST/Storage direto do renderer com o token do
// usuário logado. As policies RLS (rh_is_admin) garantem que só perfil FLOW
// ativo lê/escreve os dados internos; o público só vê vagas abertas.
import { supabase } from "@/lib/supabase";
import { currentAccessToken } from "@/lib/auth";
import { callOp } from "@/lib/flow-ops-client";
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
    if (!fallbackWorthy)
      throw new RhApiError(message || "A análise da IA falhou.");
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

export async function extractResumeTextFromUrl(
  url: string,
  mime: string,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok)
    throw new RhApiError("Não foi possível baixar o currículo para análise.");
  const buffer = await response.arrayBuffer();
  if (mime.includes("pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let text = "";
    for (
      let page = 1;
      page <= pdf.numPages && text.length < 60_000;
      page += 1
    ) {
      const content = await pdf.getPage(page).then((p) => p.getTextContent());
      text +=
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ") +
        "\n";
    }
    return text.trim();
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
