import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import logo from '@/assets/logo.png'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthFlowError, signInWithEmailPassword, validateEmail } from '@/lib/auth'
import { cn, sleep } from '@/lib/utils'

type Step = 'email' | 'password'

const ease = [0.22, 1, 0.36, 1] as const

function LoginSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
    </div>
  )
}

export function LoginForm({ className, ...props }: ComponentProps<'div'>) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [switching, setSwitching] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'password') passwordRef.current?.focus()
    if (step === 'email') emailRef.current?.focus()
  }, [step])

  async function goToPassword(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)

    try {
      validateEmail(email)
    } catch (caught) {
      setError(caught instanceof AuthFlowError ? caught.message : 'Informe um e-mail válido.')
      return
    }

    setSwitching(true)
    await sleep(420)
    setStep('password')
    setSwitching(false)
  }

  async function goBack(): Promise<void> {
    setError(null)
    setPassword('')
    setShowPassword(false)
    setSwitching(true)
    await sleep(280)
    setStep('email')
    setSwitching(false)
  }

  async function submitPassword(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)

    try {
      const user = await signInWithEmailPassword(email, password)
      window.dispatchEvent(new CustomEvent('flow:auth-changed', { detail: user }))
    } catch (caught) {
      setError(caught instanceof AuthFlowError ? caught.message : 'Não foi possível entrar.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <form onSubmit={step === 'email' ? goToPassword : submitPassword}>
        <FieldGroup>
          <div className="relative flex flex-col items-center gap-2 text-center">
            {step === 'password' ? (
              <button
                type="button"
                className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                onClick={() => void goBack()}
                aria-label="Voltar"
              >
                <ArrowLeft className="size-4" strokeWidth={1.75} />
              </button>
            ) : null}
            <div className="flex h-8 items-center justify-center">
              <img src={logo} alt="FLOW" className="h-8 w-auto object-contain" />
            </div>
            {step === 'password' ? <FieldDescription>{email}</FieldDescription> : null}
          </div>

          {switching ? (
            <LoginSkeleton />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.32, ease }}
                className="flex flex-col gap-6"
              >
                {step === 'email' ? (
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      ref={emailRef}
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      placeholder="m@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <div className="relative">
                      <Input
                        ref={passwordRef}
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" strokeWidth={1.75} />
                        ) : (
                          <Eye className="size-4" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </Field>
                )}

                <FieldError>{error}</FieldError>

                <Field>
                  <Button type="submit" disabled={pending} className="relative">
                    <span className={pending ? 'invisible' : undefined}>
                      {step === 'email' ? 'Continue' : 'Login'}
                    </span>
                    {pending ? (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="size-4 animate-spin" />
                      </span>
                    ) : null}
                  </Button>
                </Field>
              </motion.div>
            </AnimatePresence>
          )}
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a> and{' '}
        <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
