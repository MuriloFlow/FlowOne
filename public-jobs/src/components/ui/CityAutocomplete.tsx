import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MapPin, Navigation } from 'lucide-react'
import { cityLabel, loadCities, popularCities, searchCities, type City } from '../../lib/geo'

// Campo "Onde?" com menu de cidades: enquanto digita, sugere o município
// correto (com acento e UF) mesmo com erro de digitação. Ao confirmar, o
// campo vira "Ribeirão Pires, SP".

export function CityAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Cidade ou estado',
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  onSelect?: (city: City | null) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<City[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [typed, setTyped] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Carrega a base (1x) já no primeiro foco — o dropdown responde rápido.
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    loadCities()
      .catch(() => null)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let alive = true
    const term = value.trim()
    setLoading(true)
    const timer = window.setTimeout(() => {
      searchCities(term, 8)
        .then((list) => {
          if (!alive) return
          setResults(list)
          setActive(0)
        })
        .catch(() => alive && setResults(popularCities()))
        .finally(() => alive && setLoading(false))
    }, term ? 120 : 0)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [value, open])

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function commit(city: City): void {
    onChange(cityLabel(city))
    onSelect?.(city)
    setOpen(false)
    setTyped(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((current) => Math.min(current + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      if (open && results[active]) {
        event.preventDefault()
        commit(results[active])
      } else {
        onSelect?.(null)
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const showPopular = typed === false || value.trim().length === 0

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      <div className="flex items-center gap-2">
        <MapPin size={15} className="shrink-0 text-ink-300" />
        <input
          ref={inputRef}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setTyped(true)
            onChange(event.target.value)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-300"
        />
        {loading && open ? <Loader2 size={14} className="animate-spin text-ink-300" /> : null}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-[calc(100%+14px)] z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
                <Navigation size={11} className="text-brand-600" />
                {showPopular ? 'Cidades populares' : 'Sugestões de cidade'}
              </span>
              <span className="text-[11px] text-ink-400">IBGE</span>
            </div>
            <ul className="max-h-[264px] overflow-y-auto py-1" role="listbox">
              {results.length === 0 && !loading ? (
                <li className="px-4 py-3 text-[13px] text-ink-400">
                  Nenhuma cidade encontrada. Tente só o começo do nome.
                </li>
              ) : null}
              {results.map((city, index) => (
                <li key={`${city.name}-${city.uf}-${index}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(city)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                      index === active ? 'bg-surface-2' : ''
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <MapPin size={14} className="shrink-0 text-ink-300" />
                      <span className="truncate text-[13.5px] font-medium text-ink-800">
                        {city.name}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-ink-50 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-500">
                      {city.uf}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
