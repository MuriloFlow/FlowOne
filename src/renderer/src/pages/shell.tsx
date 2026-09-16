import { useEffect, useState } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { KobbiDock, KobbiFab } from '@/components/kobbi-dock'
import { ShellMain } from '@/components/shell-main'
import type { AuthUser } from '@/lib/auth'
import { DEFAULT_NAV_ID, type NavId } from '@/lib/navigation'
import { operations } from '@/lib/operations'
import { setCurrentStoreId } from '@/lib/store-scope'
import type { StoreOption } from '../../../shared/operations'

type ShellPageProps = {
  user: AuthUser
  onSignOut: () => void
}

export function ShellPage({ user, onSignOut }: ShellPageProps) {
  const [activeId, setActiveId] = useState<NavId>(DEFAULT_NAV_ID)
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [storeId, setStoreId] = useState<string | null>(() => {
    const initial = user.canFilterStores ? null : user.storeId
    setCurrentStoreId(initial)
    return initial
  })
  const [stores, setStores] = useState<StoreOption[]>([])
  const [booting, setBooting] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [compact, setCompact] = useState(false)
  const [kobbiOpen, setKobbiOpen] = useState(false)

  useEffect(() => {
    let active = true
    const boot = async () => {
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
      window.setTimeout(() => {
        if (active) setBooting(false)
      }, 420)
    }
    void boot()
    return () => {
      active = false
    }
  }, [user.canFilterStores])

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
    if (!user.canFilterStores) return
    void operations()
      .listStores()
      .then((list) => {
        setStores(list)
        setStoreId((current) => {
          if (!current || list.some((store) => store.id === current)) return current
          setCurrentStoreId(null)
          void operations().setStorePreference(null)
          return null
        })
      })
      .catch(() => setStores([]))
  }, [user.canFilterStores])

  function navigate(id: NavId): void {
    if (id === activeId && !employeeId) return
    setSwitching(true)
    setActiveId(id)
    setEmployeeId(null)
    window.setTimeout(() => setSwitching(false), 320)
  }

  function openEmployee(id: string): void {
    setSwitching(true)
    setActiveId('employees')
    setEmployeeId(id)
    window.setTimeout(() => setSwitching(false), 320)
  }

  return (
    <div className="flex min-h-0 flex-1 gap-1 overflow-hidden bg-[#111111] pt-1 pr-2 pb-2 font-medium">
      <AppSidebar
        user={user}
        activeId={activeId}
        stores={stores}
        storeId={storeId}
        loading={booting}
        compact={compact}
        onNavigate={navigate}
        onSignOut={onSignOut}
        onStoreChange={(next) => {
          setCurrentStoreId(next)
          setStoreId(next)
          setEmployeeId(null)
          void operations().setStorePreference(next)
        }}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <ShellMain
          user={user}
          activeId={activeId}
          employeeId={employeeId}
          storeId={storeId}
          loading={booting || switching}
          fab={
            kobbiOpen ? null : (
              <KobbiFab onOpen={() => setKobbiOpen(true)} />
            )
          }
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
    </div>
  )
}
