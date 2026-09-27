import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Fingerprint, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { verifyCurrentPassword } from '@/lib/sensitive-access'
import { deviceUnlock, deviceUnlockSupported } from '@/lib/device-unlock'
import { cn } from '@/lib/utils'

type PasswordConfirmationDialogProps = {
  open: boolean
  title?: string
  description: string
  confirmLabel?: string
  onClose: () => void
  onConfirmed: () => void | Promise<void>
}

/**
 * Desbloqueio estilo app de banco: no celular a PRIMEIRA tela é a da digital —
 * cadeado grande, "Desbloquear com digital" e "Tentar com Senha" embaixo.
 * Sem biometria cadastrada (ou no desktop) abre direto o modal de senha.
 */
export function PasswordConfirmationDialog({
  open,
  title = 'Confirmar identidade',
  description,
  confirmLabel = 'Liberar acesso',
  onClose,
  onConfirmed
}: PasswordConfirmationDialogProps) {
  const [screen, setScreen] = useState<'biometric' | 'password'>('password')
  const [scanning, setScanning] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setShowPassword(false)
    setSaving(false)
    setError(null)
    setUnlocking(false)
    setScanning(false)

    let cancelled = false
    void (async () => {
      if (!(await deviceUnlockSupported())) {
        setScreen('password')
        window.setTimeout(() => inputRef.current?.focus(), 120)
        return
      }
      setScreen('biometric')
      window.setTimeout(() => {
        if (cancelled) return
        setScanning(true)
        void runBiometric()
      }, 550)
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const cancelledRef = useRef(false)

  async function runBiometric(): Promise<void> {
    setScanning(true)
    setError(null)
    try {
      const result = await deviceUnlock({ description })
      if (cancelledRef.current) return
      if (result.outcome === 'ok') {
        setUnlocking(true)
        try {
          await onConfirmed()
        } finally {
          if (!cancelledRef.current) setUnlocking(false)
        }
        return
      }
      if (result.outcome === 'denied') {
        setError('Digital não validada. Tente novamente ou use sua senha.')
        return
      }
      // not-enrolled / unavailable → senha.
      setScreen('password')
      window.setTimeout(() => inputRef.current?.focus(), 120)
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [open])

  async function confirm(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await verifyCurrentPassword(password)
      await onConfirmed()
    } catch (confirmationError) {
      setError(confirmationError instanceof Error ? confirmationError.message : 'Não foi possível confirmar sua senha.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const biometricScreen = screen === 'biometric'

  return (
    <>
      <AnimatePresence>
        {biometricScreen ? (
          <motion.div
            key="biometric-fullscreen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[650] flex h-[100dvh] w-[100dvw] flex-col items-center justify-center bg-[#111111] px-8"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-5 text-center"
            >
              <div
                className={cn(
                  'grid size-24 place-items-center rounded-full transition-colors',
                  unlocking ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-white/[0.05] text-[#F0EFEC]/75',
                  scanning && !unlocking && 'animate-pulse'
                )}
              >
                {unlocking ? (
                  <Loader2 className="size-11 animate-spin" strokeWidth={1.4} />
                ) : scanning ? (
                  <Fingerprint className="size-11" strokeWidth={1.4} />
                ) : (
                  <Lock className="size-11" strokeWidth={1.4} />
                )}
              </div>
              <div>
                <p className="text-[18px] font-medium text-[#F0EFEC]/90">
                  {unlocking ? 'Desbloqueado' : 'Desbloquear com digital'}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#F0EFEC]/42">
                  {unlocking ? 'Confirmando…' : 'Encoste o dedo no sensor do aparelho'}
                </p>
              </div>
              {error ? <p className="text-[12px] text-red-300/85">{error}</p> : null}
            </motion.div>

            <button
              type="button"
              onClick={() => {
                setError(null)
                setScreen('password')
                window.setTimeout(() => inputRef.current?.focus(), 120)
              }}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-[10px] px-4 py-2.5 text-[13px] font-medium text-[#F0EFEC]/55 transition-colors hover:bg-white/[0.05] hover:text-[#F0EFEC]/85"
            >
              Tentar com Senha
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Dialog open={open} title={title} description={description} onClose={() => { if (!saving) onClose() }}>
        <div className="px-5 pb-5">
          {!biometricScreen ? (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-amber-300/10 bg-amber-300/[0.05] px-3 py-2.5 text-[12px] leading-relaxed text-[#F0EFEC]/48">
                <ShieldCheck className="size-4 shrink-0 text-amber-200/70" strokeWidth={1.7} />
                A confirmação vale somente para esta ação e não altera sua sessão.
              </div>
              <label className="block text-[12px] text-[#F0EFEC]/48" htmlFor="sensitive-password">Sua senha</label>
              <div className="relative mt-1.5">
                <Input
                  ref={inputRef}
                  id="sensitive-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void confirm() }}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  className="h-10 rounded-[10px] border-white/[0.08] bg-white/[0.03] pr-10 text-[13px]"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-[6px] p-1 text-[#F0EFEC]/38 transition-colors hover:bg-white/[0.06] hover:text-[#F0EFEC]/72"
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              {error ? <p className="mt-2 text-[12px] text-red-300/85">{error}</p> : null}
              <div className="mt-5 flex items-center justify-end gap-2">
                <button type="button" disabled={saving} onClick={onClose} className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 hover:bg-white/[0.04] hover:text-[#F0EFEC]/70 disabled:opacity-40">Cancelar</button>
                <button type="button" disabled={saving || !password} onClick={() => void confirm()} className="inline-flex h-8 items-center justify-center rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] font-medium text-[#111] disabled:opacity-40">
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : confirmLabel}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}
