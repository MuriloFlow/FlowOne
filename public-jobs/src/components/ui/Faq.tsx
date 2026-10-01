import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'

export type FaqItem = { question: string; answer: string }

/** Dúvidas frequentes — accordion animado, um aberto por vez, acessível. */
export function Faq({ items, className = '' }: { items: FaqItem[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className={`divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${className}`}>
      {items.map((item, index) => {
        const expanded = open === index
        return (
          <div key={item.question} className="relative">
            {expanded ? (
              <motion.span
                layoutId="faq-marker"
                className="absolute inset-y-0 left-0 w-[3px] rounded-r-full"
                style={{ backgroundColor: 'var(--brand-500)' }}
              />
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : index)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/60 sm:px-6 sm:py-5"
            >
              <span
                className={`font-display text-[15px] font-semibold tracking-[-0.01em] transition-colors sm:text-[15.5px] ${
                  expanded ? 'text-ink-950' : 'text-ink-800'
                }`}
              >
                {item.question}
              </span>
              <motion.span
                animate={{ rotate: expanded ? 45 : 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors"
                style={{
                  borderColor: expanded ? 'var(--brand-500)' : 'var(--line)',
                  color: expanded ? 'var(--brand-600)' : 'var(--ink-400)',
                  backgroundColor: expanded ? 'var(--brand-soft)' : 'transparent'
                }}
              >
                <Plus size={15} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 pr-12 text-[13.8px] leading-relaxed text-ink-500 sm:px-6 sm:pb-6 sm:pr-16">
                    {item.answer}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
