import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Search, Sparkles } from 'lucide-react'
import { Search01Icon } from 'hugeicons-react'
import { CityAutocomplete } from './ui/CityAutocomplete'
import { normalize, QUICK_TERMS, tokenize, wordSimilarity } from '../lib/fuzzy'
import type { City } from '../lib/geo'

type SuggestionJob = { title: string; company_name: string | null; location: string | null }

/** Barra "O quê? | Onde? | ACHAR VAGAS" com motor inteligente:
 * sugestões de cargos conforme digita + correção de erro + autocomplete
 * de cidade. */
export function SearchBar({
  query,
  location,
  onQuery,
  onLocation,
  onSubmit,
  jobs = [],
  big = false,
}: {
  query: string
  location: string
  onQuery: (value: string) => void
  onLocation: (value: string) => void
  onSubmit: () => void
  jobs?: SuggestionJob[]
  big?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [cityBusy, setCityBusy] = useState(false)

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  // Sugestões: cargos das vagas reais parecidos com o que foi digitado.
  const suggestions = useMemo(() => {
    const term = normalize(query)
    if (term.length < 2) return []
    const seen = new Set<string>()
    const scored: Array<{ title: string; score: number }> = []
    for (const job of jobs) {
      const title = job.title
      const key = normalize(title)
      if (seen.has(key)) continue
      const words = key.split(' ')
      let best = 0
      for (const word of words) {
        if (word.startsWith(term) || term.startsWith(word)) best = Math.max(best, 0.95)
        else if (word.includes(term)) best = Math.max(best, 0.85)
        else if (term.length >= 4) best = Math.max(best, wordSimilarity(term, word))
      }
      if (best >= 0.6) {
        seen.add(key)
        scored.push({ title, score: best })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 5)
  }, [query, jobs])

  const hasTypo = useMemo(() => {
    const term = normalize(query)
    if (term.length < 4 || suggestions.length === 0) return false
    const exact = jobs.some((job) => normalize(job.title).includes(term))
    return !exact
  }, [query, suggestions, jobs])

  const showQuick = query.trim().length < 2 && open
  const showSuggestions = open && query.trim().length >= 2

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setOpen(false)
        onSubmit()
      }}
      className="relative flex w-full flex-col items-stretch gap-0 overflow-visible rounded-2xl bg-surface shadow-lift sm:flex-row sm:items-stretch sm:rounded-full"
    >
      {/* O quê? — busca tolerante a erro */}
      <div ref={wrapRef} className="group relative flex min-w-0 flex-1 flex-col justify-center px-5 py-2.5">
        <label className="text-[11px] font-semibold text-ink-400" htmlFor="recruta-what">
          O quê?
        </label>
        <div className="flex items-center gap-2">
          <Search size={15} className="shrink-0 text-ink-300" />
          <input
            id="recruta-what"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onQuery(event.target.value)
              setOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
            placeholder="Cargo, área ou palavra-chave"
            className="w-full bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-300"
          />
        </div>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute left-0 right-0 top-[calc(100%+14px)] z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
            >
              {showQuick ? (
                <div className="p-2.5">
                  <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
                    <Sparkles size={11} style={{ color: 'var(--brand-500)' }} /> Buscas rápidas
                  </p>
                  <div className="flex flex-wrap gap-1.5 p-1">
                    {QUICK_TERMS.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          onQuery(term)
                          setOpen(false)
                          onSubmit()
                        }}
                        className="rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[12.5px] font-medium text-ink-600 transition-all hover:border-brand-300 hover:text-brand-700"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {showSuggestions ? (
                <ul className="py-1">
                  {hasTypo ? (
                    <li
                      className="flex items-center gap-2 px-4 py-2 text-[12px] text-ink-500"
                      style={{ backgroundColor: 'var(--brand-soft)' }}
                    >
                      <Sparkles size={12} style={{ color: 'var(--brand-600)' }} />
                      Entendemos o que você quis dizer — mostrando os cargos mais próximos.
                    </li>
                  ) : null}
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.title}>
                      <button
                        type="button"
                        onClick={() => {
                          onQuery(suggestion.title)
                          setOpen(false)
                          onSubmit()
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <Search01Icon size={15} className="shrink-0 text-ink-300" />
                        <span className="truncate text-[13.5px] font-medium text-ink-800">
                          {suggestion.title}
                        </span>
                        {suggestion.score < 0.9 ? (
                          <span
                            className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
                          >
                            parecido
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                  {suggestions.length === 0 ? (
                    <li className="px-4 py-3 text-[13px] text-ink-400">
                      Nenhum cargo parecido — tente “vendas”, “atendimento” ou “estoque”.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="mx-3 hidden w-px self-stretch bg-ink-100 sm:my-3 sm:block" aria-hidden />

      {/* Onde? — autocomplete de cidade (IBGE) */}
      <label className="flex min-w-0 flex-1 flex-col justify-center px-5 py-2.5">
        <span className="text-[11px] font-semibold text-ink-400">Onde?</span>
        <CityAutocomplete
          value={location}
          onChange={onLocation}
          onSelect={() => setCityBusy(false)}
          placeholder="Cidade (ex.: Ribeirão Pires)"
        />
      </label>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        type="submit"
        className={`m-1.5 inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-6 font-bold tracking-wide text-ink-50 transition-colors hover:bg-ink-800 sm:rounded-full ${
          big ? 'sm:px-7 sm:text-[13.5px]' : 'text-[12.5px]'
        }`}
      >
        {cityBusy ? <Loader2 size={14} className="animate-spin" /> : null}
        ACHAR VAGAS
      </motion.button>
    </form>
  )
}

/** Junta "Ribeirão Pires, SP" + termo numa busca fuzzy (o termo vira
 * contexto do local quando a pessoa digita só a cidade). */
export function citySearchTerm(location: string): string {
  const terms = tokenize(location.replace(/,.*$/, ''))
  return terms.join(' ')
}
