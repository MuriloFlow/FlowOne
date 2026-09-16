import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronUp, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StoreOption } from '../../../shared/operations'

type StoreSwitcherProps = {
  stores: StoreOption[]
  storeId: string | null
  loading?: boolean
  compact?: boolean
  onChange: (storeId: string | null) => void
}

export function StoreSwitcher({
  stores,
  storeId,
  loading = false,
  compact = false,
  onChange
}: StoreSwitcherProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = stores.find((store) => store.id === storeId)
  const label = current?.name ?? 'Todas as unidades'

  useEffect(() => {
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
  }, [])

  if (loading) {
    return <div className="mb-2 h-12 animate-pulse rounded-[12px] bg-[#151515]" />
  }

  return (
    <div ref={rootRef} className="relative mb-2">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 bottom-[calc(100%+8px)] left-0 max-h-56 overflow-auto rounded-[12px] border border-white/[0.06] bg-[#151515] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          >
            <StoreOptionButton
              active={!storeId}
              label="Todas as unidades"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            />
            {stores.map((store) => (
              <StoreOptionButton
                key={store.id}
                active={store.id === storeId}
                label={store.name}
                onClick={() => {
                  onChange(store.id)
                  setOpen(false)
                }}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

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
              <span className="mt-0.5 block truncate text-[11px] text-[#F0EFEC]/32">Unidade</span>
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
        'flex h-8 w-full items-center justify-between rounded-[8px] px-2 text-left text-[13px]',
        active ? 'bg-white/[0.06] text-[#F0EFEC]/85' : 'text-[#F0EFEC]/62 hover:bg-white/[0.04]'
      )}
    >
      <span className="truncate">{label}</span>
      {active ? <Check className="size-3.5 text-[#F0EFEC]/40" /> : null}
    </button>
  )
}
