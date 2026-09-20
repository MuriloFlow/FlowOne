import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { verifyCurrentPassword } from '@/lib/sensitive-access'

type PasswordConfirmationDialogProps = {
  open: boolean
  title?: string
  description: string
  confirmLabel?: string
  onClose: () => void
  onConfirmed: () => void | Promise<void>
}

export function PasswordConfirmationDialog({
  open,
  title = 'Confirmar identidade',
  description,
  confirmLabel = 'Liberar acesso',
  onClose,
  onConfirmed
}: PasswordConfirmationDialogProps) {
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
    window.setTimeout(() => inputRef.current?.focus(), 120)
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

  return (
    <Dialog open={open} title={title} description={description} onClose={() => { if (!saving) onClose() }}>
      <div className="px-5 pb-5">
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
      </div>
    </Dialog>
  )
}
