import { Titlebar } from '@/components/titlebar'
import { UpdateLock } from '@/components/update-lock'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useUpdater } from '@/hooks/use-updater'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { cn } from '@/lib/utils'
import { LoginPage } from '@/pages/login'
import { ShellPage } from '@/pages/shell'

function BootSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <Skeleton className="h-8 w-28" />
        <div className="flex w-full flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-8 w-64" />
      </div>
    </div>
  )
}

export function App() {
  const { user, booting, restoreError, logout } = useAuth()
  const updateStatus = useUpdater()
  const mobile = isMobileShell()
  const updateVisible =
    !mobile &&
    (updateStatus.state === 'ready' ||
      updateStatus.state === 'downloading' ||
      updateStatus.state === 'available')

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden bg-[#111111] text-foreground',
        mobile ? 'h-dvh' : 'h-screen'
      )}
      style={
        mobile
          ? {
              paddingTop: 'var(--flow-safe-top)',
              paddingBottom: 'var(--flow-safe-bottom)',
              paddingLeft: 'var(--flow-safe-left)',
              paddingRight: 'var(--flow-safe-right)'
            }
          : undefined
      }
    >
      {mobile ? null : <Titlebar branded={!user} overlay={Boolean(user)} />}
      <main className={updateVisible ? 'flex min-h-0 flex-1 pb-14' : 'flex min-h-0 flex-1'}>
        {booting ? (
          <BootSkeleton />
        ) : user ? (
          <ShellPage user={user} onSignOut={() => void logout()} />
        ) : (
          <LoginPage restoreError={restoreError} />
        )}
      </main>
      {mobile ? null : <UpdateLock status={updateStatus} />}
    </div>
  )
}
