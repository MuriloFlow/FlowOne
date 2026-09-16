import { LoginForm } from '@/components/login-form'

export function LoginPage() {
  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="relative w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}
