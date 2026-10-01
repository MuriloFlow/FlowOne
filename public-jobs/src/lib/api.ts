import { supabase } from './supabase'

export type BoardJob = {
  id: string
  slug: string
  title: string
  company_name: string | null
  location: string | null
  work_model: string | null
  employment_type: string
  salary_min: number | null
  salary_max: number | null
  salary_visible: boolean
  openings: number
  description: string | null
  requirements: string[] | null
  benefits: string[] | null
  created_at: string
}

export type Branding = {
  logo_url: string | null
  theme: 'dark' | 'light'
  primary_color: string
  secondary_color: string
  footer_note: string
}

export const FALLBACK_BRANDING: Branding = {
  logo_url: null,
  theme: 'light',
  primary_color: '#2EC97E',
  secondary_color: '#101014',
  footer_note: 'RH Inteligente by Flowdesk Brasil®'
}

/** Personalização gravada pelo FLOW (Configurações → Personalização). */
export async function fetchBranding(): Promise<Branding> {
  try {
    const { data } = await supabase
      .from('flow_branding')
      .select('logo_url, theme, primary_color, secondary_color, footer_note')
      .eq('id', true)
      .maybeSingle()
    if (!data) return FALLBACK_BRANDING
    return {
      logo_url: (data.logo_url as string | null) ?? null,
      theme: (data.theme as Branding['theme']) ?? 'light',
      primary_color: (data.primary_color as string) ?? FALLBACK_BRANDING.primary_color,
      secondary_color: (data.secondary_color as string) ?? FALLBACK_BRANDING.secondary_color,
      footer_note: (data.footer_note as string) || FALLBACK_BRANDING.footer_note
    }
  } catch {
    return FALLBACK_BRANDING
  }
}

/** Busca pública: cargo/palavra + localização (RPC SECURITY DEFINER anon). */
export async function searchJobs(
  query: string,
  location: string,
  limit = 30,
  offset = 0
): Promise<BoardJob[]> {
  const { data, error } = await supabase.rpc('rh_public_job_board', {
    p_query: query.trim() || null,
    p_location: location.trim() || null,
    p_limit: limit,
    p_offset: offset
  })
  if (error) throw new Error(friendly(error.message))
  return (data ?? []) as BoardJob[]
}

export function logoSrc(path: string | null, supabaseUrl: string): string | null {
  if (!path) return null
  // Logo nova vem como data URL (gravada direto em flow_branding.logo_url).
  if (path.startsWith('data:') || path.startsWith('http')) return path
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/rh-files/${path}`
}

function friendly(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('failed to fetch')) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.'
  }
  return message
}

export function formatSalary(job: BoardJob): string | null {
  if (!job.salary_visible) return null
  const money = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  if (job.salary_min && job.salary_max && job.salary_max > job.salary_min) {
    return `${money(job.salary_min)} a ${money(job.salary_max)}`
  }
  if (job.salary_min) return `A partir de ${money(job.salary_min)}`
  if (job.salary_max) return `Até ${money(job.salary_max)}`
  return null
}

export const EMPLOYMENT_LABEL: Record<string, string> = {
  CLT: 'CLT',
  PJ: 'PJ',
  ESTAGIO: 'Estágio',
  TRAINEE: 'Trainee',
  TEMPORARIO: 'Temporário',
  MEIO_PERIODO: 'Meio período'
}
