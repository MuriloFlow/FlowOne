import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

// Field com erro animado (mesmo da referência).

type FieldProps = {
  label: string
  error?: string | null
  hint?: string | null
  required?: boolean
  children: ReactNode
  className?: string
}

export default function Field({ label, error, hint, required, children, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label className="mb-1.5 flex items-baseline gap-1 text-[13.5px] font-medium text-ink-700">
        {label}
        {required && <span className="text-brand-600">*</span>}
      </label>
      <div data-error={!!error}>{children}</div>
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-1.5 flex items-center gap-1 text-[12.5px] font-medium text-red-600"
          >
            <AlertCircle size={13} className="shrink-0" />
            {error}
          </motion.p>
        ) : hint ? (
          <p key="hint" className="mt-1.5 text-[12.5px] text-ink-400">
            {hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
