import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, X, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Kit de UI pública (Badge/Empty/Error/Modal/Confirm/Toasts) — clone da referência.

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`chip ${className}`}>{children}</span>
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-ink-100 bg-ink-50 text-ink-400">
          {icon}
        </div>
      )}
      <h3 className="font-display text-[16px] font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  )
}

export function ErrorState({
  title = 'Algo deu errado',
  message,
  onRetry
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <EmptyState
      icon={<AlertTriangle size={24} />}
      title={title}
      description={message ?? 'Ocorreu um erro inesperado. Tente novamente em instantes.'}
      action={
        onRetry ? (
          <button className="btn-outline" onClick={onRetry}>
            Tentar novamente
          </button>
        ) : undefined
      }
    />
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  wide?: boolean
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === backdropRef.current) onClose()
            e.stopPropagation()
          }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/40 p-0 backdrop-blur-[6px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface shadow-pop sm:rounded-2xl ${
              wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
            }`}
          >
            {title && (
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/90 px-5 py-4 backdrop-blur">
                <h2 className="font-display text-[16px] font-semibold text-ink-900">{title}</h2>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center sm:text-left">
        <div
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl sm:mx-0 ${
            danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600'
          }`}
        >
          <AlertTriangle size={22} />
        </div>
        <h3 className="font-display text-[17px] font-semibold text-ink-900">{title}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button
            className={danger ? 'btn bg-red-600 text-white shadow-lift shadow-red-600/25 hover:bg-red-700' : 'btn-primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string }

const ToastContext = createContext<{ push: (kind: Toast['kind'], message: string) => void }>({
  push: () => {}
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, kind, message }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 4200)
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13.5px] font-medium shadow-pop ${
                t.kind === 'success'
                  ? 'bg-ink-950 text-white'
                  : t.kind === 'error'
                    ? 'bg-red-600 text-white'
                    : 'border border-line bg-surface text-ink-900'
              }`}
              role="status"
            >
              {t.kind === 'success' && <CheckCircle2 size={17} className="shrink-0 text-emerald-400" />}
              {t.kind === 'error' && <AlertTriangle size={17} className="shrink-0" />}
              {t.kind === 'info' && <Info size={17} className="shrink-0 text-brand-500" />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

export { AlertCircle }
