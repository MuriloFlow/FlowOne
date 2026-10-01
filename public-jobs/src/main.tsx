import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LandingPage from './pages/LandingPage'
import SearchPage from './pages/SearchPage'
import { fetchBranding, logoSrc, type Branding } from './lib/api'
import { applyBranding } from './lib/theme'
import { supabase } from './lib/supabase'

// Rotas reais de servidor (Caddy): / e /search?query=&location=

/** Skeleton de boot: cobre o site inteiro até a personalização chegar —
 * evita mostrar o layout com a cor padrão antes de saber a cor escolhida. */
function BootSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <div className="w-full">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <div className="skeleton h-9 w-40" />
          <div className="skeleton mt-4 h-14 w-full rounded-2xl" />
        </div>
      </div>
      <div className="hero-glow" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-14 text-center sm:px-6">
        <div className="skeleton mx-auto h-6 w-72 rounded-full" />
        <div className="skeleton mx-auto mt-5 h-12 w-[22rem] max-w-full" />
        <div className="skeleton mx-auto mt-3 h-12 w-[26rem] max-w-full" />
        <div className="skeleton mx-auto mt-5 h-5 w-96 max-w-full" />
        <div className="mx-auto mt-9 grid max-w-4xl gap-3 sm:grid-cols-3">
          <div className="skeleton h-5" />
          <div className="skeleton h-5" />
          <div className="skeleton h-5" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="skeleton h-6 w-56" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="card p-5">
              <div className="skeleton h-5 w-16 rounded-full" />
              <div className="skeleton mt-3 h-5 w-3/4" />
              <div className="skeleton mt-2 h-4 w-1/2" />
              <div className="skeleton mt-6 h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [branding, setBranding] = useState<Branding | null>(null)
  const route = window.location.pathname

  useEffect(() => {
    let alive = true
    fetchBranding().then((data) => {
      if (!alive) return
      applyBranding(data)
      setBranding(data)
    })
    return () => {
      alive = false
    }
  }, [])

  const goSearch = useCallback((query: string, location: string) => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())
    if (location.trim()) params.set('location', location.trim())
    window.location.href = `/search${params.toString() ? `?${params.toString()}` : ''}`
  }, [])

  if (!branding) return <BootSkeleton />

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? ''
  const logo = logoSrc(branding.logo_url, supabaseUrl)
  document.title =
    branding.footer_note === 'RH Inteligente by Flowdesk Brasil®'
      ? 'Vagas — RH Inteligente by Flowdesk'
      : `Vagas — ${branding.footer_note}`

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
