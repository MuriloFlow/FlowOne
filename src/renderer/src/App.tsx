import { Titlebar } from '@/components/titlebar'
import { UpdateLock } from '@/components/update-lock'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useUpdater } from '@/hooks/use-updater'
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
  const { user, booting, logout } = useAuth()
  const updateStatus = useUpdater()
  const updateVisible =
    updateStatus.state === 'ready' ||
    updateStatus.state === 'downloading' ||
    updateStatus.state === 'available'

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#111111] text-foreground">
      <Titlebar branded={!user} />
      <main className={updateVisible ? 'flex min-h-0 flex-1 pb-14' : 'flex min-h-0 flex-1'}>
        {booting ? <BootSkeleton /> : user ? <ShellPage user={user} onSignOut={() => void logout()} /> : <LoginPage />}
      </main>
      <UpdateLock status={updateStatus} />
    </div>
  )
}
