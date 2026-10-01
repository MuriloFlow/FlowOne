import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Lock, UserRound } from 'lucide-react'
import { useBranding, logoSrc } from '../lib/branding'
import { getSession } from '../lib/candidate-auth'
import { useEffect, useState } from 'react'

// Layout público — header/footer com branding dinâmico (logo/cores do FLOW).
// Botão principal virou "Área do Candidato" (portal de status do candidato).

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { branding, loaded } = useBranding()
  const logo = logoSrc(branding.logo_url)
  const [logged, setLogged] = useState(false)

  useEffect(() => {
    let alive = true
    getSession().then((value) => alive && setLogged(Boolean(value)))
    return () => {
      alive = false
    }
  }, [])

  const primary = branding.primary_color

  if (!loaded) {
    // Skeleton de página inteira até a personalização chegar (sem flash da
    // cor padrão e sem texto “piscando”).
    return (
      <div className="flex min-h-screen flex-col bg-page">
        <div className="border-b border-line">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="skeleton h-9 w-40" />
            <div className="skeleton h-9 w-44 rounded-xl" />
          </div>
        </div>
        <div className="hero-glow" aria-hidden />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-16 text-center sm:px-6 sm:pt-24">
          <div className="skeleton mx-auto h-7 w-64 rounded-full" />
          <div className="skeleton mx-auto mt-6 h-12 w-[24rem] max-w-full" />
          <div className="skeleton mx-auto mt-3 h-12 w-[20rem] max-w-full" />
          <div className="skeleton mx-auto mt-6 h-12 w-full max-w-xl rounded-2xl" />
        </div>
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:grid-cols-2 sm:px-6">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="card p-6">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton mt-3 h-4 w-1/2" />
              <div className="skeleton mt-5 h-9 w-28 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#/" className="transition-opacity hover:opacity-80" aria-label="Início">
            {logo ? (
              <img src={logo} alt="Logo" className="h-9 w-auto max-w-[170px] object-contain" />
            ) : (
              <BrandMark primary={primary} />
            )}
          </a>

          <nav className="flex items-center gap-1 sm:gap-2">
            <motion.a
              whileHover={{ y: -1 }}
              whileTap={{ y: 0 }}
              href="https://vagas.db.flwdesk.com/"
              className="hidden rounded-lg px-3 py-2 text-[14px] font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 sm:block"
            >
              Ver vagas
            </motion.a>
            <motion.a
              whileHover={{ y: -1 }}
              whileTap={{ y: 0, scale: 0.97 }}
              href="#/candidato"
              className="btn-brand !px-4 !py-2 text-[14px]"
              style={{ backgroundColor: primary }}
            >
              <UserRound size={15} />
              {logged ? 'Minhas candidaturas' : 'Área do Candidato'}
            </motion.a>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-line bg-surface/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
          {logo ? (
            <img src={logo} alt="Logo" className="h-7 w-auto max-w-[140px] object-contain" />
          ) : (
            <BrandMark primary={primary} small />
          )}
          <div className="flex flex-col items-center gap-1 sm:items-end">
            <p className="text-[12.5px] font-medium text-ink-500">{branding.footer_note}</p>
            <p className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-400">
              <Lock size={12} className="text-brand-600" />
              Área segura · seus dados estão protegidos
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** Marca padrão (quando não há logo enviada): "Faça parte do time". */
function BrandMark({ primary, small = false }: { primary: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="relative flex shrink-0 items-center justify-center rounded-xl bg-ink-950 shadow-lift"
        style={{ width: small ? 28 : 34, height: small ? 28 : 34 }}
      >
        <span
          className="font-display font-bold text-white"
          style={{ fontSize: (small ? 28 : 34) * 0.42, letterSpacing: '-0.03em' }}
        >
          FL
        </span>
        <span
          className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full shadow-soft"
          style={{ backgroundColor: primary }}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff" aria-hidden>
            <path d="M12 2l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 13.6l-5 3.6 1.9-5.8L4 7.8h6.1L12 2z" />
          </svg>
        </span>
      </span>
      {!small ? (
        <div className="leading-tight">
          <div className="font-display text-[15.5px] font-semibold tracking-[-0.02em] text-ink-900">
            Faça parte do time
          </div>
          <div className="text-[11.5px] font-medium text-ink-400">Digaspi Ribeirão Pires</div>
        </div>
      ) : null}
    </div>
  )
}
