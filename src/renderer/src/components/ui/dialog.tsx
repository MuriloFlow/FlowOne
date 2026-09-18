import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isMobileShell } from '@/lib/is-mobile-shell'

type DialogProps = {
  open: boolean
  title: string
  description?: string
  wide?: boolean
  children: ReactNode
  onClose: () => void
}

export function Dialog({ open, title, description, wide = false, children, onClose }: DialogProps) {
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className={cn('fixed inset-0 z-[400] flex items-center justify-center', isMobileShell() ? 'p-3' : 'p-6')}>
          <motion.button
            type="button"
            aria-label="Fechar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/45 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="flow-dialog-title"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative z-10 w-full overflow-hidden rounded-[16px] border border-white/[0.07] bg-[#171717] shadow-[0_24px_80px_rgba(0,0,0,0.55)]',
              wide ? 'max-w-[720px]' : 'max-w-[460px]'
            )}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
              <div>
                <h2 id="flow-dialog-title" className="text-[15px] font-medium text-[#F0EFEC]/90">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-[#F0EFEC]/42">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex size-7 items-center justify-center rounded-[8px] text-[#F0EFEC]/35 transition-colors hover:bg-white/[0.05] hover:text-[#F0EFEC]/70"
              >
                <X className="size-3.5" strokeWidth={1.8} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
