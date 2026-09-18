import { LoginForm } from '@/components/login-form'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { cn } from '@/lib/utils'

export function LoginPage({ restoreError }: { restoreError?: string | null }) {
  return (
    <div
      className={cn(
        'bg-background flex min-h-0 flex-1 flex-col items-center justify-center gap-6',
        isMobileShell() ? 'p-4' : 'p-6 md:p-10'
      )}
    >
      <div className="relative w-full min-w-0 max-w-sm">
        <LoginForm initialError={restoreError} />
      </div>
    </div>
  )
}
