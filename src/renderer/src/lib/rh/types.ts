// Domínio do PORTAL DO RH — espelha as tabelas rh_* da database flowone
// (mesma base do FLOW, RLS via rh_is_admin()). Fonte: supabase/rh_inteligente_schema.sql.

export type RhJobStatus = "draft" | "open" | "paused" | "closed";

export type RhEmploymentType =
  "CLT" | "PJ" | "ESTAGIO" | "TRAINEE" | "TEMPORARIO" | "MEIO_PERIODO";

export type RhApplicationStatus =
  | "submitted"
  | "viewed"
  | "in_review"
  | "interview_online_scheduled"
  | "interview_presencial_scheduled"
  | "approved"
  | "rejected"
  | "hired";

export type RhQuestionType =
  | "TEXT"
  | "TEXTAREA"
  | "SELECT"
  | "MULTISELECT"
  | "NUMBER"
  | "BOOLEAN"
  | "DATE"
  | "FILE";

export type RhQuestionScope = "GLOBAL" | "JOB";

export type RhOptionEffect = "NONE" | "DISQUALIFY" | "PENALTY";

export type RhJob = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  work_model: string;
  employment_type: RhEmploymentType;
  contract_type: string;
  status: RhJobStatus;
  description: string | null;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_visible: boolean;
  openings: number;
  created_at: string;
  updated_at: string;
  /** Contagem de candidaturas (enrich no client). */
  applications_count?: number;
};

export type RhOption = {
  id?: string;
  question_id?: string;
  value: string;
  label: string;
  points: number;
  effect: RhOptionEffect;
  order_index: number;
};

export type RhQuestion = {
  id: string;
  scope: RhQuestionScope;
  job_id: string | null;
  type: RhQuestionType;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  options: RhOption[] | null;
  required: boolean;
  order_index: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type RhCandidate = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  cpf: string | null;
  birth_date: string | null;
  city: string | null;
  state: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  zip_code?: string | null;
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  district?: string | null;
  created_at: string;
};

export type RhFile = {
  id: string;
  application_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  kind: string;
  created_at: string;
};

export type RhApplication = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: RhApplicationStatus;
  score: number;
  score_breakdown: {
    auto_points?: number;
    disqualified?: boolean;
    ai_band?: string;
  } | null;
  current_stage: string | null;
  created_at: string;
  updated_at: string;
  job?: RhJob | null;
  candidate?: RhCandidate | null;
  rh_files?: RhFile[] | null;
};

export type RhAnswer = {
  id: string;
  application_id: string;
  question_id: string | null;
  value_text: string | null;
  value_json: unknown;
  answered_at: string;
  rh_questions?: { label: string; type: RhQuestionType } | null;
};

export type RhStatusEvent = {
  id: string;
  application_id: string;
  from_status: RhApplicationStatus | null;
  to_status: RhApplicationStatus;
  actor_type: "ADMIN" | "SYSTEM";
  actor_id: string | null;
  note: string | null;
  created_at: string;
};

export type RhInterview = {
  id: string;
  application_id: string;
  mode: "online" | "presencial";
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_url: string | null;
  interviewer: string | null;
  notes: string | null;
  result: string | null;
  created_at: string;
};

export type RhInternalNote = {
  id: string;
  application_id: string;
  author_id: string | null;
  author_name: string | null;
  content: string;
  created_at: string;
};

export type RhCriterion = {
  id: string;
  job_id: string | null;
  kind: "SCORE" | "DISQUALIFIER";
  label: string;
  points: number;
  config: Record<string, unknown>;
  active: boolean;
  order_index: number;
  created_at?: string;
};

export type RhAiAssessment = {
  id: string;
  application_id: string;
  score: number;
  band: "ALTA" | "MEDIA" | "BAIXA" | "ELIMINADO";
  summary: string;
  positives: string[];
  negatives: string[];
  experience_analysis: string;
  transport_analysis: string;
  conclusion: string;
  details: Record<string, unknown>;
  resume_chars: number | null;
  model: string;
  created_at: string;
};

export type RhAiRule = {
  id: string;
  rule_key: string;
  label: string;
  config: Record<string, unknown>;
  active: boolean;
  updated_at?: string;
};

// ---------- Labels / pipeline ----------

export const JOB_STATUS_META: Record<
  RhJobStatus,
  { label: string; tone: "green" | "amber" | "gray" | "blue" }
> = {
  open: { label: "Aberta", tone: "green" },
  paused: { label: "Pausada", tone: "amber" },
  draft: { label: "Rascunho", tone: "gray" },
  closed: { label: "Encerrada", tone: "blue" },
};

export const APPLICATION_STATUS_META: Record<
  RhApplicationStatus,
  { label: string; dot: string; chip: string }
> = {
  submitted: {
    label: "Novo",
    dot: "bg-[#F0EFEC]/40",
    chip: "border border-white/10 bg-white/[0.05] text-[#F0EFEC]/70",
  },
  viewed: {
    label: "Visualizado",
    dot: "bg-sky-400",
    chip: "border border-sky-300/20 bg-sky-300/10 text-sky-200/90",
  },
  in_review: {
    label: "Em análise",
    dot: "bg-amber-400",
    chip: "border border-amber-300/20 bg-amber-300/10 text-amber-200/90",
  },
  interview_online_scheduled: {
    label: "Entrevista online",
    dot: "bg-violet-400",
    chip: "border border-violet-300/20 bg-violet-300/10 text-violet-200/90",
  },
  interview_presencial_scheduled: {
    label: "Entrevista presencial",
    dot: "bg-fuchsia-400",
    chip: "border border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-200/90",
  },
  approved: {
    label: "Aprovado",
    dot: "bg-emerald-400",
    chip: "border border-emerald-300/20 bg-emerald-300/10 text-emerald-200/90",
  },
  rejected: {
    label: "Reprovado",
    dot: "bg-red-400",
    chip: "border border-red-300/20 bg-red-300/10 text-red-200/90",
  },
  hired: {
    label: "Contratado",
    dot: "bg-teal-400",
    chip: "border border-teal-300/20 bg-teal-300/10 text-teal-200/90",
  },
};

export const APPLICATION_PIPELINE_ORDER: RhApplicationStatus[] = [
  "submitted",
  "viewed",
  "in_review",
  "interview_online_scheduled",
  "interview_presencial_scheduled",
  "approved",
  "rejected",
  "hired",
];

export const EMPLOYMENT_TYPE_LABEL: Record<RhEmploymentType, string> = {
  CLT: "CLT",
  PJ: "PJ",
  ESTAGIO: "Estágio",
  TRAINEE: "Trainee",
  TEMPORARIO: "Temporário",
  MEIO_PERIODO: "Meio período",
};

export const QUESTION_TYPE_LABEL: Record<RhQuestionType, string> = {
  TEXT: "Texto curto",
  TEXTAREA: "Texto longo",
  SELECT: "Escolha única",
  MULTISELECT: "Múltipla escolha",
  NUMBER: "Número",
  BOOLEAN: "Sim/Não",
  DATE: "Data",
  FILE: "Arquivo",
};
