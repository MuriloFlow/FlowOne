import { AnimatePresence, motion } from 'framer-motion'
import { Component, type ReactNode } from 'react'
import { EmployeeProfilePage } from '@/pages/employee-profile'
import { EmployeesPage } from '@/pages/employees'
import { FinancePage } from '@/pages/finance'
import { OverviewPage } from '@/pages/overview'
import { CardsPage } from '@/pages/cards'
import { PlaceholderPage } from '@/pages/placeholder'
import { AttendancePage } from '@/pages/attendance'
import { SchedulesPage } from '@/pages/schedules'
import { StoresPage } from '@/pages/stores'
import { UsersPage } from '@/pages/users'
import { VouchersPage } from '@/pages/vouchers'
import { SorteioPage } from '@/pages/sorteio'
import type { AuthUser } from '@/lib/auth'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { DEFAULT_NAV_ID, getNavItem, type NavId } from '@/lib/navigation'
import { cn } from '@/lib/utils'

type ShellMainProps = {
  user: AuthUser
  activeId: NavId
  employeeId?: string | null
  storeId?: string | null
  loading?: boolean
  fab?: ReactNode
  onOpenEmployee: (id: string) => void
  onCloseEmployee: () => void
  onOpenStoreOperation?: (storeId: string) => void
  onOpenStoreTeam?: (storeId: string) => void
  onStoresChanged?: () => void
}

const ease = [0.22, 1, 0.36, 1] as const

type PageErrorBoundaryProps = {
  children: ReactNode
  title?: string
  message?: string
}

type PageErrorBoundaryState = {
  hasError: boolean
}

class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): PageErrorBoundaryState {
    return { hasError: true }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#181818] p-6 text-center">
          <p className="text-sm font-semibold text-[#F0EFEC]">{this.props.title ?? 'Não foi possível abrir esta aba'}</p>
          <p className="mt-2 max-w-md text-sm text-white/60">
            {this.props.message ?? 'Houve um erro ao montar este painel. Tente abrir outra aba ou atualizar a tela.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#F0EFEC] transition hover:bg-white/10"
          >
            Tentar novamente
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

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
  onCloseEmployee,
  onOpenStoreOperation,
  onOpenStoreTeam,
  onStoresChanged
}: ShellMainProps) {
  const activeNavId = activeId && getNavItem(activeId)?.id ? activeId : DEFAULT_NAV_ID
  const current = getNavItem(activeNavId)
  const mobile = isMobileShell()
  const showChrome =
    !mobile &&
    activeId !== 'overview' &&
    activeId !== 'vouchers' &&
    activeId !== 'sorteio' &&
    activeId !== 'finance' &&
    activeId !== 'cards' &&
    activeId !== 'stores' &&
    activeId !== 'schedules' &&
    activeId !== 'attendance' &&
    activeId !== 'users' &&
    !(activeId === 'employees' && !employeeId)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay: 0.05, ease }}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#151515]',
        mobile && 'mx-2 mb-2'
      )}
      style={{ borderRadius: 18 }}
    >
      {loading ? (
        <MainSkeleton />
      ) : (
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto',
            mobile ? 'px-4 py-4' : 'px-7 py-6'
          )}
        >
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
              {activeId === 'overview' ? (
                <PageErrorBoundary>
                  <OverviewPage user={user} storeId={storeId} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'finance' ? (
                <PageErrorBoundary>
                  <FinancePage storeId={storeId} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'employees' && employeeId ? (
                <PageErrorBoundary>
                  <EmployeeProfilePage employeeId={employeeId} storeId={storeId} onBack={onCloseEmployee} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'employees' && !employeeId ? (
                <PageErrorBoundary>
                  <EmployeesPage storeId={storeId} onOpenProfile={onOpenEmployee} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'cards' ? (
                <PageErrorBoundary>
                  <CardsPage storeId={storeId} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'vouchers' ? (
                <PageErrorBoundary>
                  <VouchersPage storeId={storeId} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'sorteio' ? (
                <PageErrorBoundary>
                  <SorteioPage storeId={storeId} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'stores' ? (
                <PageErrorBoundary>
                  <StoresPage
                    storeId={storeId}
                    onOpenOperation={onOpenStoreOperation}
                    onOpenTeam={onOpenStoreTeam}
                    onDeskChanged={onStoresChanged}
                  />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'schedules' ? (
                <PageErrorBoundary>
                  <SchedulesPage storeId={storeId} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'attendance' ? (
                <PageErrorBoundary>
                  <AttendancePage storeId={storeId} />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'users' ? (
                <PageErrorBoundary>
                  <UsersPage />
                </PageErrorBoundary>
              ) : null}
              {activeId === 'reports' ? (
                <PageErrorBoundary>
                  <PlaceholderPage title="Relatório e projeções" />
                </PageErrorBoundary>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      <AnimatePresence>{fab}</AnimatePresence>
    </motion.section>
  )
}
