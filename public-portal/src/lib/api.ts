import { supabase } from './supabase'
import type { SubmitPayload, SubmitResult } from './validation'
import type { RhJob, RhQuestion, RhOption } from './types'

// ---------------- Vagas públicas ----------------

export async function fetchOpenJobs(): Promise<RhJob[]> {
  const { data, error } = await supabase
    .from('rh_jobs')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as RhJob[]
}

export async function fetchJobBySlug(slug: string): Promise<RhJob | null> {
  const { data, error } = await supabase
    .from('rh_jobs')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'open')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as RhJob) ?? null
}

// ---------------- Perguntas (público lê apenas as ativas) ----------------

export async function fetchFormQuestions(jobId?: string): Promise<{
  questions: RhQuestion[]
  optionsByQuestion: Record<string, RhOption[]>
}> {
  let query = supabase
    .from('rh_questions')
    .select('*, rh_options(*)')
    .eq('active', true)
    .order('order_index', { ascending: true })

  // GLOBAL sempre; JOB só da vaga específica
  if (jobId) {
    query = query.or(`scope.eq.GLOBAL,and(scope.eq.JOB,job_id.eq.${jobId})`)
  } else {
    query = query.eq('scope', 'GLOBAL')
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as (RhQuestion & { rh_options: RhOption[] | null })[]
  const questions: RhQuestion[] = []
  const optionsByQuestion: Record<string, RhOption[]> = {}

  for (const row of rows) {
    questions.push(row)
    if (row.rh_options && row.rh_options.length > 0) {
      optionsByQuestion[row.id] = [...row.rh_options].sort((a, b) => a.order_index - b.order_index)
    }
  }

  return { questions, optionsByQuestion }
}

// ---------------- Upload de currículo ----------------

function sanitizeFileName(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext.toLowerCase()}`
}

export async function uploadResume(jobSlug: string, file: File): Promise<{ storage_path: string }> {
  // Nome único por tentativa evita 409 quando o mesmo candidato tenta de novo.
  const path = `cvs/${jobSlug}/${sanitizeFileName(file.name)}`
  const { error } = await supabase.storage
    .from('rh-files')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    })

  if (error) throw new Error(friendlyStorageError(error.message))
  return { storage_path: path }
}

export function friendlyStorageError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('bucket not found')) {
    return 'O envio de arquivos está temporariamente indisponível. Tente novamente em alguns minutos.'
  }
  if (m.includes('payload too large') || m.includes('too large')) {
    return 'Arquivo muito grande (máx. 10 MB). Reduza o tamanho do arquivo e tente novamente.'
  }
  if (m.includes('invalid mime type') || m.includes('mime type')) {
    return 'Formato de arquivo não permitido. Envie em PDF, DOC ou DOCX.'
  }
  if (m.includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.'
  }
  return message
}

// ---------------- Submissão atômica ----------------

export async function submitApplication(payload: SubmitPayload): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc('rh_submit_application', {
    p_payload: payload as unknown as Record<string, unknown>
  })

  if (error) return { error: error.message }
  return (data ?? { error: 'Resposta vazia do servidor.' }) as SubmitResult
}
