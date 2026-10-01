// Branding lido de flow_branding (gravado pelo FLOW → Configurações → Personalização).
// O hook também APLICA o branding (cores derivadas + tema) no documento.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { applyBranding } from './theme'

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

export function useBranding(): { branding: Branding; loaded: boolean } {
  const [branding, setBranding] = useState<Branding>(FALLBACK_BRANDING)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    supabase
      .from('flow_branding')
      .select('logo_url, theme, primary_color, secondary_color, footer_note')
      .eq('id', true)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        const next: Branding = data
          ? {
              logo_url: (data.logo_url as string | null) ?? null,
              theme: (data.theme as Branding['theme']) ?? 'light',
              primary_color:
                (data.primary_color as string) ?? FALLBACK_BRANDING.primary_color,
              secondary_color:
                (data.secondary_color as string) ?? FALLBACK_BRANDING.secondary_color,
              footer_note: (data.footer_note as string) || FALLBACK_BRANDING.footer_note
            }
          : FALLBACK_BRANDING
        applyBranding(next)
        setBranding(next)
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])
  return { branding, loaded }
}

export function logoSrc(path: string | null): string | null {
  if (!path) return null
  // Logo nova vem como data URL (gravada direto em flow_branding.logo_url).
  if (path.startsWith('data:') || path.startsWith('http')) return path
  const url = (import.meta.env.VITE_SUPABASE_URL as string) ?? ''
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/rh-files/${path}`
}
