import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Lock, Search } from 'lucide-react'

export function BoardLayout({
  branding,
  logo,
  children,
  searchSlot,
  onHome,
}: {
  branding: { primary_color: string; secondary_color: string; footer_note: string }
  logo: string | null
  children: ReactNode
  searchSlot?: ReactNode
  onHome?: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* Faixa superior (estilo InfoJobs: barra escura com a busca) */}
      <div
        className="w-full"
        style={{ backgroundColor: branding.primary_color }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onHome}
              className="flex items-center gap-2.5 transition-opacity hover:opacity-85"
              aria-label="Início"
            >
              {logo ? (
                <img
                  src={logo}
                  alt="Logo"
                  className="h-8 w-auto max-w-[160px] object-contain"
                />
              ) : (
                <span className="flex h-8 items-center gap-2">
                  <span
                    className="flex size-8 items-center justify-center rounded-lg text-[12px] font-bold text-white"
                    style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
                  >
                    FL
                  </span>
                  <span className="font-display text-[15px] font-semibold tracking-tight text-white">
                    RH Inteligente
                  </span>
                </span>
              )}
            </button>
            <span
              className="hidden rounded-full px-3 py-1 text-[11.5px] font-semibold sm:block"
              style={{ backgroundColor: 'rgba(0,0,0,0.22)', color: '#fff' }}
            >
              Vagas de emprego
            </span>
          </div>
          {searchSlot}
        </div>
      </div>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-line bg-surface/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
          {logo ? (
            <img src={logo} alt="Logo" className="h-7 w-auto max-w-[140px] object-contain" />
          ) : (
            <span className="font-display text-[14px] font-semibold text-ink-800">
              RH Inteligente
            </span>
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

/** Barra de busca "O quê? | Onde? | ACHAR VAGAS" (referência InfoJobs). */
export function SearchBar({
  query,
  location,
  onQuery,
  onLocation,
  onSubmit,
  big = false,
}: {
  query: string
  location: string
  onQuery: (value: string) => void
  onLocation: (value: string) => void
  onSubmit: () => void
  big?: boolean
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className={`flex w-full items-stretch gap-0 overflow-hidden rounded-2xl bg-surface shadow-lift ${
        big ? 'sm:rounded-full' : 'rounded-2xl'
      }`}
    >
      <label className="group flex min-w-0 flex-1 flex-col justify-center px-5 py-2.5">
        <span className="text-[11px] font-semibold text-ink-400">O quê?</span>
        <div className="flex items-center gap-2">
          <Search size={15} className="shrink-0 text-ink-300" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Cargo ou palavra-chave"
            className="w-full bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-300"
          />
        </div>
      </label>
      <div className="my-2 w-px bg-ink-100" aria-hidden />
      <label className="flex min-w-0 flex-1 flex-col justify-center px-5 py-2.5">
        <span className="text-[11px] font-semibold text-ink-400">Onde?</span>
        <input
          value={location}
          onChange={(event) => onLocation(event.target.value)}
          placeholder="Cidade ou estado (ex.: Santo André - SP)"
          className="w-full bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-300"
        />
      </label>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        type="submit"
        className={`m-1.5 inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-6 font-bold tracking-wide text-ink-50 transition-colors hover:bg-ink-800 ${
          big ? 'sm:rounded-full' : ''
        } ${big ? 'text-[13.5px]' : 'text-[12.5px]'}`}
      >
        ACHAR VAGAS
      </motion.button>
    </form>
  )
}
