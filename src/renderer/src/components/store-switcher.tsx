import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronUp, MapPin, Search, X } from 'lucide-react'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type { StoreOption } from '../../../shared/operations'

type StoreSwitcherProps = {
  stores: StoreOption[]
  storeId: string | null
  loading?: boolean
  compact?: boolean
  onChange: (storeId: string | null) => void
}

function asStores(value: unknown): StoreOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const item = row as { id?: unknown; name?: unknown; createdAt?: unknown }
    if (typeof item.id !== 'string' || typeof item.name !== 'string') return []
    return [
      {
        id: item.id,
        name: item.name,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined
      }
    ]
  })
}

export function StoreSwitcher({
  stores,
  storeId,
  loading = false,
  compact = false,
  onChange
}: StoreSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [localStores, setLocalStores] = useState<StoreOption[]>(asStores(stores))
  const [loadError, setLoadError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const mobile = isMobileShell()
  const current = localStores.find((store) => store.id === storeId)
  const label = current?.name ?? 'Todas as unidades'
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return localStores
    return localStores.filter((store) => store.name.toLowerCase().includes(q))
  }, [localStores, query])

  useEffect(() => {
    setLocalStores(asStores(stores))
  }, [stores])

  useEffect(() => {
    if (asStores(stores).length > 0) return
    let active = true
    void operations()
      .listStores()
      .then((list) => {
        if (!active) return
        setLocalStores(asStores(list))
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'Não deu para carregar as unidades.')
      })
    return () => {
      active = false
    }
  }, [stores])

  useEffect(() => {
    if (mobile) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mobile])

  function pick(next: string | null): void {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  if (loading) {
    return <div className="mb-2 h-12 animate-pulse rounded-[12px] bg-[#151515]" />
  }

  const options = (
    <>
      <StoreOptionButton active={!storeId} label="Todas as unidades" onClick={() => pick(null)} />
      {filtered.map((store) => (
        <StoreOptionButton
          key={store.id}
          active={store.id === storeId}
          label={store.name}
          onClick={() => pick(store.id)}
        />
      ))}
      {filtered.length === 0 ? (
        <p className="px-2 py-3 text-[12px] text-[#F0EFEC]/40">
          {loadError ?? (localStores.length === 0 ? 'Carregando unidades…' : 'Nenhuma unidade com esse nome.')}
        </p>
      ) : null}
    </>
  )

  return (
    <div ref={rootRef} className="relative mb-2">
      {mobile
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  className="fixed inset-0 z-[320]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <button
                    type="button"
                    aria-label="Fechar unidades"
                    className="absolute inset-0 bg-black/55"
                    onClick={() => setOpen(false)}
                  />
                  <motion.div
                    initial={{ y: 40 }}
                    animate={{ y: 0 }}
                    exit={{ y: 40 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                    className="absolute inset-x-0 bottom-0 max-h-[78vh] rounded-t-[20px] bg-[#151515] px-3 pt-3 pb-[var(--flow-safe-bottom)]"
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <p className="text-[14px] text-[#F0EFEC]/80">Unidades</p>
                      <button
                        type="button"
                        aria-label="Fechar"
                        onClick={() => setOpen(false)}
                        className="flex size-9 items-center justify-center text-[#F0EFEC]/50"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <label className="mb-2 flex h-10 items-center gap-2 rounded-[10px] bg-[#111111] px-3">
                      <Search className="size-3.5 text-[#F0EFEC]/30" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Buscar unidade"
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#F0EFEC]/80 outline-none placeholder:text-[#F0EFEC]/28"
                      />
                    </label>
                    <div className="max-h-[56vh] overflow-y-auto pb-2">{options}</div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : (
            <AnimatePresence>
              {open ? (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 bottom-[calc(100%+8px)] left-0 max-h-56 overflow-auto rounded-[12px] border border-white/[0.06] bg-[#151515] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
                >
                  {options}
                </motion.div>
              ) : null}
            </AnimatePresence>
          )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-12 w-full items-center gap-3 rounded-[12px] bg-[#151515] px-2.5 text-left transition-colors',
          open && 'bg-[#1A1A1A]',
          compact && 'justify-center px-0'
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[#F0EFEC]/45">
          <MapPin className="size-3.5" strokeWidth={1.7} />
        </span>
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-tight text-[#F0EFEC]/75">{label}</span>
              <span className="mt-0.5 block truncate text-[11px] text-[#F0EFEC]/32">
                {localStores.length > 0 ? `${localStores.length} unidades` : 'Unidade'}
              </span>
            </span>
            <ChevronUp
              className={cn(
                'size-3.5 text-[#F0EFEC]/30 transition-transform duration-300',
                open && 'rotate-180'
              )}
              strokeWidth={1.6}
            />
          </>
        )}
      </button>
    </div>
  )
}

function StoreOptionButton({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-10 w-full items-center justify-between rounded-[8px] px-2 py-2 text-left text-[13px]',
        active ? 'bg-white/[0.06] text-[#F0EFEC]/85' : 'text-[#F0EFEC]/62 hover:bg-white/[0.04]'
      )}
    >
      <span className="truncate">{label}</span>
      {active ? <Check className="size-3.5 text-[#F0EFEC]/40" /> : null}
    </button>
  )
}
