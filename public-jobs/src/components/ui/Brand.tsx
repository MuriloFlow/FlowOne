import { Briefcase } from 'lucide-react'

/** Marca do Recruta+ — sempre a NOSSA marca (nunca a logo do cliente,
 * que fica só no portal dele em /digaspi). */
export function Brand({
  tone = 'auto',
  compact = false,
}: {
  tone?: 'auto' | 'light'
  compact?: boolean
}) {
  const light = tone === 'light'
  return (
    <span className="inline-flex select-none items-center gap-2.5">
      <span
        className="relative flex shrink-0 items-center justify-center rounded-[11px] shadow-brand transition-transform group-hover:-rotate-3"
        style={{
          width: compact ? 30 : 34,
          height: compact ? 30 : 34,
          background: 'linear-gradient(135deg, var(--brand-400), var(--brand-700))'
        }}
      >
        <Briefcase size={compact ? 14 : 16} color="#fff" strokeWidth={2.2} />
        <span
          className="absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full font-display font-bold leading-none shadow-soft"
          style={{
            width: compact ? 13 : 15,
            height: compact ? 13 : 15,
            fontSize: compact ? 9 : 10,
            backgroundColor: 'var(--brand-500)',
            color: 'var(--brand-contrast)'
          }}
        >
          +
        </span>
      </span>
      <span
        className="font-display font-bold leading-none tracking-[-0.02em]"
        style={{
          fontSize: compact ? 16 : 17.5,
          color: light ? '#fff' : 'var(--ink-950)'
        }}
      >
        Recruta
        <span style={{ color: light ? '#fff' : 'var(--brand-500)' }}>+</span>
      </span>
    </span>
  )
}
