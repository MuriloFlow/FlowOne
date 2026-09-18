import { motion } from 'framer-motion'
import logo from '@/assets/logo.png'
import { StoreSwitcher } from '@/components/store-switcher'
import { UserMenu } from '@/components/user-menu'
import type { AuthUser } from '@/lib/auth'
import { NAV_ITEMS, visibleNavItems, type NavId } from '@/lib/navigation'
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
  const items = visibleNavItems(user.role)
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
        {loading
          ? Array.from({ length: NAV_ITEMS.length }).map((_, index) => (
              <div key={index} className="flex h-9 items-center gap-3 px-3">
                <div className="size-4 animate-pulse rounded bg-white/6" />
                {compact ? null : <div className="h-2.5 w-28 animate-pulse rounded-full bg-white/6" />}
              </div>
            ))
          : items.map((item, index) => {
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
                    'relative flex h-9 w-full items-center gap-3 px-3 text-left font-medium transition-colors duration-200',
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
                      'relative z-10 size-4 shrink-0 object-contain',
                      active ? 'opacity-80' : 'opacity-45'
                    )}
                  />
                  {compact ? null : (
                    <span className="relative z-10 truncate text-[13px] leading-none">{item.label}</span>
                  )}
                </motion.button>
              )
            })}
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
