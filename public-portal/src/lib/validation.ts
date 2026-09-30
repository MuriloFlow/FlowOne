import { z } from 'zod'

// Esquemas de validação por etapa (idênticos à referência).
export const stepAccountSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo.')
    .max(160, 'Nome muito longo.')
    .regex(/\s/, 'Informe nome e sobrenome.'),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  phone: z.string().trim().min(10, 'Informe um telefone com DDD.').max(20),
  cpf: z
    .string()
    .trim()
    .refine((v) => v === '' || v.replace(/\D/g, '').length === 11, 'CPF deve ter 11 dígitos.')
    .optional()
    .or(z.literal('')),
  birth_date: z.string().trim().optional().or(z.literal(''))
})

export const stepLocationSchema = z.object({
  city: z.string().trim().min(2, 'Informe a cidade.').max(120),
  state: z.string().trim().length(2, 'Use a sigla do estado (ex.: SP).'),
  linkedin_url: z
    .string()
    .trim()
    .url('Informe uma URL válida.')
    .optional()
    .or(z.literal('')),
  portfolio_url: z
    .string()
    .trim()
    .url('Informe uma URL válida.')
    .optional()
    .or(z.literal(''))
})

export const RESUME_MAX_BYTES = 10 * 1024 * 1024 // 10 MB (limite do bucket)

export const RESUME_ACCEPTED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] as const

export function validateResumeFile(file: { type: string; size: number }): string | null {
  if (!RESUME_ACCEPTED.includes(file.type as (typeof RESUME_ACCEPTED)[number])) {
    return 'Formatos aceitos: PDF, DOC ou DOCX.'
  }
  if (file.size > RESUME_MAX_BYTES) return 'Arquivo muito grande (máx. 10 MB).'
  if (file.size === 0) return 'Arquivo vazio.'
  return null
}

export type SubmitPayload = {
  job_id: string
  full_name: string
  email: string
  phone: string
  cpf?: string
  birth_date?: string
  city?: string
  state?: string
  zip_code?: string
  street?: string
  street_number?: string
  complement?: string
  district?: string
  linkedin_url?: string
  portfolio_url?: string
  answers: Record<string, AnswerValue>
  file?: {
    storage_path: string
    file_name: string
    mime_type: string
    size_bytes: number
  }
}

export type AnswerValue = string | string[] | boolean | number | null

export type SubmitResult = {
  application_id?: string
  duplicate?: boolean
  message?: string
  score?: number
  error?: string
}
