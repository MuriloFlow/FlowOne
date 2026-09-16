import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { EmployeeProfilePage } from '@/pages/employee-profile'
import { EmployeesPage } from '@/pages/employees'
import { FinancePage } from '@/pages/finance'
import { OverviewPage } from '@/pages/overview'
import { PlaceholderPage } from '@/pages/placeholder'
import { VouchersPage } from '@/pages/vouchers'
import type { AuthUser } from '@/lib/auth'
import { DEFAULT_NAV_ID, getNavItem, type NavId } from '@/lib/navigation'

type ShellMainProps = {
  user: AuthUser
  activeId: NavId
  employeeId?: string | null
  storeId?: string | null
  loading?: boolean
  fab?: ReactNode
  onOpenEmployee: (id: string) => void
  onCloseEmployee: () => void
}

const ease = [0.22, 1, 0.36, 1] as const

function MainSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-7 py-6">
      <div className="mb-8 flex items-center gap-2">
        <div className="h-3 w-20 animate-pulse rounded-full bg-white/6" />
        <div className="h-3 w-1.5 animate-pulse rounded-full bg-white/6" />
        <div className="h-3 w-24 animate-pulse rounded-full bg-white/6" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="h-24 animate-pulse rounded-2xl bg-white/4" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/4" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/4" />
      </div>
      <div className="mt-4 min-h-0 flex-1 animate-pulse rounded-2xl bg-white/4" />
    </div>
  )
}

export function ShellMain({
  user,
  activeId,
  employeeId = null,
  storeId = null,
  loading = false,
  fab = null,
  onOpenEmployee,
  onCloseEmployee
}: ShellMainProps) {
  const current = getNavItem(activeId)
  const showChrome =
    activeId !== 'overview' &&
    activeId !== 'vouchers' &&
    activeId !== 'finance' &&
    !(activeId === 'employees' && !employeeId)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay: 0.05, ease }}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#151515]"
      style={{ borderRadius: 18 }}
    >
      {loading ? (
        <MainSkeleton />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 py-6">
          {showChrome ? (
            <nav className="mb-6 flex items-center gap-2 text-[13px] font-medium">
              {activeId === DEFAULT_NAV_ID ? (
                <span className="text-white/40">{current.label}</span>
              ) : (
                <>
                  <span className="text-white/12">Visão Geral</span>
                  <span className="text-white/12">/</span>
                  <span className="text-white/40">{current.label}</span>
                  {employeeId ? (
                    <>
                      <span className="text-white/12">/</span>
                      <span className="text-white/40">Perfil</span>
                    </>
                  ) : null}
                </>
              )}
            </nav>
          ) : null}

          <AnimatePresence mode="wait">
            <motion.div
              key={employeeId ? `employee:${employeeId}:${storeId ?? 'all'}` : `${activeId}:${storeId ?? 'all'}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.32, ease }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {activeId === 'overview' ? <OverviewPage user={user} storeId={storeId} /> : null}
              {activeId === 'finance' ? <FinancePage storeId={storeId} /> : null}
              {activeId === 'employees' && employeeId ? (
                <EmployeeProfilePage employeeId={employeeId} storeId={storeId} onBack={onCloseEmployee} />
              ) : null}
              {activeId === 'employees' && !employeeId ? (
                <EmployeesPage storeId={storeId} onOpenProfile={onOpenEmployee} />
              ) : null}
              {activeId === 'cards' ? <PlaceholderPage title="Cartões" /> : null}
              {activeId === 'vouchers' ? <VouchersPage storeId={storeId} /> : null}
              {activeId === 'stores' ? <PlaceholderPage title="Unidades" /> : null}
              {activeId === 'schedules' ? <PlaceholderPage title="Escalas e horários" /> : null}
              {activeId === 'reports' ? <PlaceholderPage title="Relatório e projeções" /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      <AnimatePresence>{fab}</AnimatePresence>
    </motion.section>
  )
}
