import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { AppSidebar } from '@/components/app-sidebar'
import { KobbiDock, KobbiFab } from '@/components/kobbi-dock'
import { MobileShellHeader } from '@/components/mobile-shell-header'
import { ScopeLock } from '@/components/scope-lock'
import { ShellMain } from '@/components/shell-main'
import type { AuthUser } from '@/lib/auth'
import { isMobileShell } from '@/lib/is-mobile-shell'
import {
  clearSessionNavId,
  getNavItem,
  readSessionNavId,
  writeSessionNavId,
  type NavId
} from '@/lib/navigation'
import { operations } from '@/lib/operations'
import { setCurrentStoreId } from '@/lib/store-scope'
import type { ActorScopeView, StoreOption } from '../../../shared/operations'

type ShellPageProps = {
  user: AuthUser
  onSignOut: () => void
}

export function ShellPage({ user, onSignOut }: ShellPageProps) {
  const [activeId, setActiveId] = useState<NavId>(() => readSessionNavId(user.role))
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [storeId, setStoreId] = useState<string | null>(() => {
    const initial = user.canFilterStores ? null : user.storeId
    setCurrentStoreId(initial)
    return initial
  })
  const [stores, setStores] = useState<StoreOption[]>([])
  const [scope, setScope] = useState<ActorScopeView | null>(null)
  const [booting, setBooting] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [compact, setCompact] = useState(false)
  const [kobbiOpen, setKobbiOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const mobile = isMobileShell()

  useEffect(() => {
    let active = true
    const boot = async () => {
      try {
        const next = await operations().getActorScope()
        if (!active) return
        setScope(next)
        if (next.blocked) {
          setCurrentStoreId(null)
          setStoreId(null)
          setBooting(false)
          return
        }
      } catch {
        if (!active) return
        if (!user.canFilterStores && !user.storeId) {
          setScope({
            role: user.role,
            canViewAll: false,
            storeId: null,
            blocked: true,
            message:
              'Sua conta ainda não tem uma unidade. Peça para um Lider de Operação, Supervisor ou Diretor te vincular em Usuários.'
          })
          setBooting(false)
          return
        }
      }
      if (user.canFilterStores) {
        try {
          const saved = await operations().getStorePreference()
          if (!active) return
          setCurrentStoreId(saved)
          setStoreId(saved)
        } catch {
          /* mantém o padrão */
        }
      }
      if (active) setBooting(false)
    }
    void boot()
    return () => {
      active = false
    }
  }, [user.canFilterStores, user.role, user.storeId])

  useEffect(() => {
    const frame = window.matchMedia('(max-width: 1240px)')
    const sync = () => setCompact(frame.matches)
    sync()
    frame.addEventListener('change', sync)
    return () => frame.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    setCurrentStoreId(storeId)
  }, [storeId])

  useEffect(() => {
    writeSessionNavId(activeId)
  }, [activeId])

  useEffect(() => {
    if (scope?.blocked || !user.canFilterStores) return
    let active = true
    void operations()
      .listStores()
      .then((list) => {
        if (!active) return
        const next = Array.isArray(list)
          ? list.filter((store) => typeof store?.id === 'string' && typeof store?.name === 'string')
          : []
        setStores(next)
        setStoreId((current) => {
          if (!current || next.some((store) => store.id === current)) return current
          setCurrentStoreId(null)
          void operations().setStorePreference(null)
          return null
        })
      })
      .catch(() => {
        /* o StoreSwitcher tenta de novo sozinho */
      })
    return () => {
      active = false
    }
  }, [scope?.blocked, user.canFilterStores])

  function handleSignOut(): void {
    clearSessionNavId()
    onSignOut()
  }

  if (scope?.blocked) {
    return (
      <ScopeLock
        message={
          scope.message ??
          'Sua conta ainda não tem uma unidade. Peça para um Lider de Operação, Supervisor ou Diretor te vincular em Usuários.'
        }
        onSignOut={handleSignOut}
      />
    )
  }

  if (booting) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#111111]">
        <div className="h-8 w-28 animate-pulse rounded-md bg-white/6" />
      </div>
    )
  }

  function navigate(id: NavId): void {
    if (id === activeId && !employeeId) {
      if (mobile) setNavOpen(false)
      return
    }
    setSwitching(true)
    setActiveId(id)
    setEmployeeId(null)
    if (mobile) setNavOpen(false)
    window.setTimeout(() => setSwitching(false), 320)
  }

  function openEmployee(id: string): void {
    setSwitching(true)
    setActiveId('employees')
    setEmployeeId(id)
    window.setTimeout(() => setSwitching(false), 320)
  }

  const sidebar = (
    <AppSidebar
      user={user}
      activeId={activeId}
      stores={stores}
      storeId={storeId}
      loading={false}
      compact={mobile ? false : compact}
      className={mobile ? 'w-full overflow-visible pt-2 pb-1' : undefined}
      onNavigate={navigate}
      onSignOut={handleSignOut}
      onStoreChange={(next) => {
        setCurrentStoreId(next)
        setStoreId(next)
        setEmployeeId(null)
        void operations().setStorePreference(next)
      }}
    />
  )

  const main = (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <ShellMain
        user={user}
        activeId={activeId}
        employeeId={employeeId}
        storeId={storeId}
        loading={switching}
        fab={kobbiOpen ? null : <KobbiFab onOpen={() => setKobbiOpen(true)} />}
        onOpenEmployee={openEmployee}
        onCloseEmployee={() => {
          setEmployeeId(null)
        }}
        onOpenStoreOperation={(id) => {
          setCurrentStoreId(id)
          setStoreId(id)
          setEmployeeId(null)
          void operations().setStorePreference(id)
          navigate('overview')
        }}
        onStoresChanged={() => {
          void operations()
            .listStores()
            .then(setStores)
            .catch(() => undefined)
        }}
        onOpenStoreTeam={(id) => {
          setCurrentStoreId(id)
          setStoreId(id)
          setEmployeeId(null)
          void operations().setStorePreference(id)
          navigate('employees')
        }}
      />
      <KobbiDock
        open={kobbiOpen}
        storeId={storeId}
        userName={user.displayName}
        userRole={user.displayRole}
        onClose={() => setKobbiOpen(false)}
      />
    </div>
  )

  if (mobile) {
    const title = employeeId ? 'Perfil' : getNavItem(activeId).label
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#111111] font-medium">
        <MobileShellHeader title={title} onOpenNav={() => setNavOpen(true)} />
        {createPortal(
          <AnimatePresence>
            {navOpen ? (
              <motion.div
                className="fixed inset-0 z-[200]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <button
                  type="button"
                  aria-label="Fechar menu"
                  className="absolute inset-0 bg-black/55"
                  onClick={() => setNavOpen(false)}
                />
                <motion.div
                  initial={{ x: -320 }}
                  animate={{ x: 0 }}
                  exit={{ x: -320 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                  className="relative flex h-full w-[min(284px,86vw)] flex-col overflow-hidden bg-[#111111] pt-[var(--flow-safe-top)] pb-[var(--flow-safe-bottom)] shadow-[8px_0_40px_rgba(0,0,0,0.45)]"
                >
                  {sidebar}
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body
        )}
        {main}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 gap-1 overflow-hidden bg-[#111111] pr-2 pb-2 font-medium">
      {sidebar}
      {main}
    </div>
  )
}
