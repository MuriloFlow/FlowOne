import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

// Logo do portal — idêntica à referência, marca "FLOW".

export function Logo({
  size = 34,
  withText = true,
  subtitle
}: {
  size?: number
  withText?: boolean
  subtitle?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, rotate: -6 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.5, ease: [0.34, 1.3, 0.64, 1] }}
        className="relative flex shrink-0 items-center justify-center rounded-xl bg-ink-950 shadow-lift"
        style={{ width: size, height: size }}
      >
        <span
          className="font-display font-bold text-white"
          style={{ fontSize: size * 0.42, letterSpacing: '-0.03em' }}
        >
          FL
        </span>
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-500 shadow-soft">
          <Sparkles size={8} className="text-white" />
        </span>
      </motion.div>
      {withText && (
        <div className="leading-tight">
          <div className="font-display text-[15.5px] font-semibold tracking-[-0.02em] text-ink-900">
            Faça parte do time
          </div>
          {subtitle && <div className="text-[11.5px] font-medium text-ink-400">{subtitle}</div>}
        </div>
      )}
    </div>
  )
}
