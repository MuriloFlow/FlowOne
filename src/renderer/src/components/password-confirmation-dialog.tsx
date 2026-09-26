import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Fingerprint, Loader2, ShieldCheck } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { verifyCurrentPassword } from '@/lib/sensitive-access'
import { deviceUnlock, deviceUnlockSupported } from '@/lib/device-unlock'

type PasswordConfirmationDialogProps = {
  open: boolean
  title?: string
  description: string
  confirmLabel?: string
  onClose: () => void
  onConfirmed: () => void | Promise<void>
}

type Mode = 'checking' | 'biometric' | 'password'

/**
 * Confirmação de ação sensível. No celular, tenta primeiro a digital/credencial
 * do próprio aparelho (nada de digitar senha toda hora); sem biometria
 * cadastrada — ou no desktop — pede a senha do FLOW como sempre.
 */
export function PasswordConfirmationDialog({
  open,
  title = 'Confirmar identidade',
  description,
  confirmLabel = 'Liberar acesso',
  onClose,
  onConfirmed
}: PasswordConfirmationDialogProps) {
  const [mode, setMode] = useState<Mode>('password')
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

    let cancelled = false
    void (async () => {
      if (!(await deviceUnlockSupported())) {
        setMode('password')
        window.setTimeout(() => inputRef.current?.focus(), 120)
        return
      }
      setMode('checking')
      const result = await deviceUnlock({ description })
      if (cancelled) return
      if (result.outcome === 'ok') {
        setMode('biometric')
        setSaving(true)
        try {
          await onConfirmed()
        } finally {
          if (!cancelled) setSaving(false)
        }
        return
      }
      if (result.outcome === 'denied') {
        setMode('biometric')
        setError('Digital não validada. Tente novamente ou use sua senha do FLOW.')
        return
      }
      // not-enrolled / unavailable: sem digital no aparelho, usa a senha.
      setMode('password')
      window.setTimeout(() => inputRef.current?.focus(), 120)
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function retryBiometric(): Promise<void> {
    setError(null)
    setSaving(true)
    try {
      const result = await deviceUnlock({ description })
      if (result.outcome === 'ok') {
        await onConfirmed()
        return
      }
      if (result.outcome === 'denied') {
        setError('Digital não validada. Tente novamente ou use sua senha do FLOW.')
        return
      }
      setMode('password')
      window.setTimeout(() => inputRef.current?.focus(), 120)
    } finally {
      setSaving(false)
    }
  }

  const biometricActive = mode === 'checking' || mode === 'biometric'

  return (
    <Dialog open={open} title={title} description={description} onClose={() => { if (!saving) onClose() }}>
      <div className="px-5 pb-5">
        <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-amber-300/10 bg-amber-300/[0.05] px-3 py-2.5 text-[12px] leading-relaxed text-[#F0EFEC]/48">
          <ShieldCheck className="size-4 shrink-0 text-amber-200/70" strokeWidth={1.7} />
          A confirmação vale somente para esta ação e não altera sua sessão.
        </div>

        {biometricActive ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="grid size-14 place-items-center rounded-full bg-[#34D399]/10 text-[#34D399]">
              {mode === 'checking' ? (
                <Loader2 className="size-7 animate-spin" strokeWidth={1.6} />
              ) : (
                <Fingerprint className="size-7" strokeWidth={1.6} />
              )}
            </div>
            <p className="text-[13px] text-[#F0EFEC]/70">
              {mode === 'checking'
                ? 'Preparando a digital do aparelho…'
                : saving
                  ? 'Digital validada. Confirmando…'
                  : 'Toque no sensor ou use a senha do aparelho.'}
            </p>
            {error ? <p className="text-center text-[12px] text-red-300/85">{error}</p> : null}
            {mode === 'biometric' && !saving ? (
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void retryBiometric()}
                  className="inline-flex h-8 items-center justify-center rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] font-medium text-[#111]"
                >
                  Tentar de novo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setMode('password')
                    window.setTimeout(() => inputRef.current?.focus(), 120)
                  }}
                  className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 hover:bg-white/[0.04] hover:text-[#F0EFEC]/70"
                >
                  Usar senha do FLOW
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
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
        )}
      </div>
    </Dialog>
  )
}
