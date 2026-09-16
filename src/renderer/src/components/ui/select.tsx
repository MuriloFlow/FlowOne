import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SelectOption = {
  value: string
  label: string
}

type SelectProps = {
  value: string
  options: SelectOption[]
  placeholder?: string
  onChange: (value: string) => void
}

type MenuCoords = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

export function Select({ value, options, placeholder = 'Selecionar', onChange }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<MenuCoords | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = options.find((option) => option.value === value)

  function measure(): void {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow
    const maxHeight = Math.max(120, Math.min(224, openUp ? spaceAbove : spaceBelow))
    setCoords({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 })
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
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

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((state) => !state)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 text-left text-[13px] transition-colors',
          open ? 'border-white/16' : 'hover:border-white/12',
          current ? 'text-[#F0EFEC]/80' : 'text-[#F0EFEC]/32'
        )}
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
        <ChevronDown className={cn('size-3.5 text-[#F0EFEC]/30 transition-transform', open && 'rotate-180')} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && coords ? (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: coords.bottom === undefined ? 4 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: coords.bottom === undefined ? 4 : -4 }}
              transition={{ duration: 0.14 }}
              style={{
                position: 'fixed',
                left: coords.left,
                width: coords.width,
                top: coords.top,
                bottom: coords.bottom,
                maxHeight: coords.maxHeight,
                zIndex: 70
              }}
              className="overflow-auto rounded-[12px] border border-white/[0.08] bg-[#1A1A1A] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
            >
              {options.map((option) => {
                const active = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex h-8 w-full items-center justify-between rounded-[8px] px-2.5 text-left text-[13px]',
                      active
                        ? 'bg-white/[0.06] text-[#F0EFEC]/85'
                        : 'text-[#F0EFEC]/62 hover:bg-white/[0.04] hover:text-[#F0EFEC]/80'
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {active ? <Check className="size-3.5 text-[#F0EFEC]/45" /> : null}
                  </button>
                )
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
