import { AnimatePresence, motion } from 'framer-motion'
import { useState, type ReactElement } from 'react'
import { ChevronDown } from 'lucide-react'
import logo from '@/assets/logo.png'
import { StoreSwitcher } from '@/components/store-switcher'
import { UserMenu } from '@/components/user-menu'
import type { AuthUser } from '@/lib/auth'
import { RH_NAV_GROUP, visibleNavItems, type NavId } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import type { StoreOption } from '../../../shared/operations'

type AppSidebarProps = {
  user: AuthUser
  activeId: NavId
  stores: StoreOption[]
  storeId: string | null
  loading?: boolean
  compact?: boolean
  className?: string
  onNavigate: (id: NavId) => void
  onSignOut: () => void
  onStoreChange: (storeId: string | null) => void
}

const ease = [0.22, 1, 0.36, 1] as const

export function AppSidebar({
  user,
  activeId,
  stores,
  storeId,
  loading = false,
  compact = false,
  className,
  onNavigate,
  onSignOut,
  onStoreChange
}: AppSidebarProps) {
  const mainItems = visibleNavItems(user.role).filter((item) => !RH_NAV_GROUP.items.some((sub) => sub.id === item.id))
  const rhItems = RH_NAV_GROUP.items
  const rhActive = rhItems.some((item) => item.id === activeId)
  // A categoria abre sozinha quando uma aba dela está ativa (deep link/mobile).
  const [rhOpen, setRhOpen] = useState(rhActive)

  function toggleRh(): void {
    if (compact) {
      onNavigate('rh_overview')
      return
    }
    setRhOpen((open) => {
      const next = !open
      if (!next && rhActive) onNavigate('rh_overview')
      return next
    })
  }

  function navButton(
    item: { id: NavId; label: string; icon: string },
    index: number,
    small = false
  ): ReactElement {
    const active = item.id === activeId
    return (
      <motion.button
        key={item.id}
        type="button"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.06 + index * 0.035, ease }}
        onClick={() => onNavigate(item.id)}
        className={cn(
          'relative flex w-full items-center gap-3 px-3 text-left font-medium transition-colors duration-200',
          small ? 'h-8' : 'h-9',
          compact && 'justify-center px-0',
          active ? 'text-[#F0EFEC]/80' : 'text-[#F0EFEC]/45 hover:text-[#F0EFEC]/60'
        )}
      >
        {active ? (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-[8px] bg-[#1F1F1F]"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          />
        ) : null}
        <img
          src={item.icon}
          alt=""
          className={cn(
            'relative z-10 shrink-0 object-contain',
            small ? 'size-3.5' : 'size-4',
            active ? 'opacity-80' : 'opacity-45'
          )}
        />
        {compact ? null : (
          <span className={cn('relative z-10 truncate leading-none', small ? 'text-[12.5px]' : 'text-[13px]')}>
            {item.label}
          </span>
        )}
      </motion.button>
    )
  }

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col overflow-visible bg-transparent px-3 pb-3',
        compact ? 'w-[76px] pt-3' : 'w-[284px] pt-4',
        className
      )}
    >
      <div
        className={cn(
          'mb-4 flex h-12 shrink-0 items-center overflow-visible',
          compact ? 'justify-center px-0' : 'px-2'
        )}
      >
        {loading ? (
          <div className="h-5 w-[5.5rem] animate-pulse rounded-md bg-white/6" />
        ) : (
          <div className="flex h-8 items-center overflow-visible py-1.5">
            <motion.img
              src={logo}
              alt="FLOW"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
              className="h-5 w-auto max-w-[132px] origin-left object-contain object-left"
            />
          </div>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {loading ? (
          Array.from({ length: NAV_SKELETON_COUNT }).map((_, index) => (
            <div key={index} className="flex h-9 items-center gap-3 px-3">
              <div className="size-4 animate-pulse rounded bg-white/6" />
              {compact ? null : <div className="h-2.5 w-28 animate-pulse rounded-full bg-white/6" />}
            </div>
          ))
        ) : (
          <>
            {mainItems.map((item, index) => navButton(item, index))}
            {!compact ? (
              <motion.button
                type="button"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.06 + mainItems.length * 0.035, ease }}
                onClick={toggleRh}
                className={cn(
                  'mt-2 flex h-9 w-full items-center gap-3 px-3 text-left font-medium transition-colors duration-200',
                  rhActive ? 'text-[#F0EFEC]/80' : 'text-[#F0EFEC]/45 hover:text-[#F0EFEC]/60'
                )
              }
              >
                <img
                  src={RH_NAV_GROUP.icon}
                  alt=""
                  className={cn('size-4 shrink-0 object-contain', rhActive ? 'opacity-80' : 'opacity-45')}
                />
                <span className="relative z-10 flex-1 truncate text-[13px] leading-none tracking-wide">
                  {RH_NAV_GROUP.label}
                </span>
                <motion.span
                  animate={{ rotate: rhOpen ? 180 : 0 }}
                  transition={{ duration: 0.22, ease }}
                  className="text-[#F0EFEC]/35"
                >
                  <ChevronDown className="size-3.5" strokeWidth={2} />
                </motion.span>
              </motion.button>
            ) : null}

            <AnimatePresence initial={false}>
              {rhOpen && !compact ? (
                <motion.div
                  key="rh-items"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.26, ease }}
                  className="relative overflow-hidden pl-[22px]"
                >
                  <span className="absolute top-2 bottom-2 left-[15px] w-px bg-white/[0.06]" aria-hidden />
                  {rhItems.map((item, index) => navButton(item, index, true))}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {compact ? rhItems.map((item, index) => navButton(item, index)) : null}
          </>
        )}
      </nav>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.28, ease }}
        className="mt-3 shrink-0 pb-1"
      >
        {user.canFilterStores ? (
          <StoreSwitcher
            stores={stores}
            storeId={storeId}
            loading={loading}
            compact={compact}
            onChange={onStoreChange}
          />
        ) : null}
        <UserMenu user={user} loading={loading} compact={compact} onSignOut={onSignOut} />
      </motion.div>
    </aside>
  )
}

const NAV_SKELETON_COUNT = 12
