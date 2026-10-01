import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LandingPage from './pages/LandingPage'
import SearchPage from './pages/SearchPage'
import { FALLBACK_BRANDING, fetchBranding, logoSrc, type Branding } from './lib/api'
import { supabase } from './lib/supabase'

// Rotas reais de servidor (Caddy): / e /search?query=&location=

function App() {
  const [branding, setBranding] = useState<Branding>(FALLBACK_BRANDING)
  const route = window.location.pathname

  useEffect(() => {
    let alive = true
    fetchBranding().then((data) => {
      if (alive) setBranding(data)
    })
    return () => {
      alive = false
    }
  }, [])

  // Design tokens dinâmicos (cor primária/secundária do FLOW).
  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', branding.primary_color)
    document.documentElement.style.setProperty('--brand-secondary', branding.secondary_color)
    document.title =
      branding.footer_note === 'RH Inteligente by Flowdesk Brasil®'
        ? 'Vagas — RH Inteligente by Flowdesk'
        : `Vagas — ${branding.footer_note}`
  }, [branding])

  const goSearch = useCallback((query: string, location: string) => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())
    if (location.trim()) params.set('location', location.trim())
    window.location.href = `/search${params.toString() ? `?${params.toString()}` : ''}`
  }, [])

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? ''
  const logo = logoSrc(branding.logo_url, supabaseUrl)

  const page =
    route.startsWith('/search') ? (
      <SearchPage branding={branding} logo={logo} />
    ) : (
      <LandingPage branding={branding} logo={logo} onSearch={goSearch} />
    )

  return page
}

void supabase

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
