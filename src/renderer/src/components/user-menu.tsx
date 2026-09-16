import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronUp, LogOut, Search, Settings, UserRound } from 'lucide-react'
import type { AuthUser } from '@/lib/auth'
import { initials, roleLabel } from '@/lib/identity'
import { cn } from '@/lib/utils'

type UserMenuProps = {
  user: AuthUser
  loading?: boolean
  compact?: boolean
  onSignOut: () => void
}

type MenuAction = 'account' | 'settings' | 'search'

function MenuItem({
  icon,
  label,
  hint,
  tone = 'default',
  onClick
}: {
  icon: ReactNode
  label: string
  hint?: string
  tone?: 'default' | 'danger'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] font-medium transition-colors',
        tone === 'danger'
          ? 'text-[#F0EFEC]/55 hover:bg-white/[0.04] hover:text-[#F0EFEC]/80'
          : 'text-[#F0EFEC]/70 hover:bg-white/[0.05] hover:text-[#F0EFEC]/90'
      )}
    >
      <span className="flex size-4 items-center justify-center text-current opacity-70">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? (
        <span className="rounded-[5px] border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] leading-none text-[#F0EFEC]/35">
          {hint}
        </span>
      ) : null}
    </button>
  )
}

export function UserMenu({ user, loading = false, compact = false, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  function select(_action: MenuAction): void {
    setOpen(false)
  }

  if (loading) {
    return (
      <div className="flex h-12 items-center gap-3 rounded-[12px] bg-[#151515] px-2.5">
        <div className="size-8 animate-pulse rounded-full bg-white/6" />
        {compact ? null : (
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-28 animate-pulse rounded-full bg-white/6" />
            <div className="h-2 w-16 animate-pulse rounded-full bg-white/6" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 bottom-[calc(100%+8px)] left-0 overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#151515] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          >
            <div className="mb-1 flex items-center gap-2.5 rounded-[8px] px-2 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[11px] font-medium text-[#F0EFEC]/60">
                {initials(user.displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] leading-tight text-[#F0EFEC]/85">
                  {user.displayName}
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-tight text-[#F0EFEC]/38">
                  {user.email}
                </span>
              </span>
            </div>

            <div className="mx-1 mb-1 h-px bg-white/[0.06]" />

            <MenuItem
              icon={<UserRound className="size-3.5" strokeWidth={1.7} />}
              label="Conta"
              onClick={() => select('account')}
            />
            <MenuItem
              icon={<Settings className="size-3.5" strokeWidth={1.7} />}
              label="Configurações"
              onClick={() => select('settings')}
            />
            <MenuItem
              icon={<Search className="size-3.5" strokeWidth={1.7} />}
              label="Buscar"
              hint="Ctrl K"
              onClick={() => select('search')}
            />

            <div className="mx-1 my-1 h-px bg-white/[0.06]" />

            <MenuItem
              icon={<LogOut className="size-3.5" strokeWidth={1.7} />}
              label="Sair"
              tone="danger"
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
            />
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
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[11px] font-medium text-[#F0EFEC]/55">
          {initials(user.displayName)}
        </span>
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-tight font-medium text-[#F0EFEC]/75">
                {user.displayName}
              </span>
              <span className="mt-0.5 block truncate text-[11px] leading-tight font-medium text-[#F0EFEC]/38">
                {user.displayRole ?? roleLabel(user.role)}
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
