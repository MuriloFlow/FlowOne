import type { MouseEvent, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'

// Adaptação do "bento-grid" (MagicUI) com o nosso tema: cards com brilho que
// segue o mouse na cor da marca.

export function BentoGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-3 ${className}`}>{children}</div>
  )
}

export function BentoCard({
  icon,
  title,
  description,
  className = '',
  href,
  cta,
  children,
}: {
  icon?: ReactNode
  title: string
  description: string
  className?: string
  href?: string
  cta?: string
  children?: ReactNode
}) {
  function handleMove(event: MouseEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }

  const body = (
    <>
      <div className="bento-glow" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        {icon ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface shadow-soft transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105">
            {icon}
          </span>
        ) : null}
        {href ? (
          <ArrowUpRight
            size={17}
            className="text-ink-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            style={{ color: 'var(--brand-500)' }}
          />
        ) : null}
      </div>
      <div className="relative mt-4">
        <h3 className="font-display text-[16px] font-semibold tracking-[-0.015em] text-ink-950">
          {title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{description}</p>
        {children}
        {cta ? (
          <span
            className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold"
            style={{ color: 'var(--brand-600)' }}
          >
            {cta} <ArrowUpRight size={13} />
          </span>
        ) : null}
      </div>
    </>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onMouseMove={handleMove}
      className={`group relative overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-card transition-shadow duration-300 hover:shadow-lift ${className}`}
    >
      {href ? (
        <a href={href} className="absolute inset-0 z-10" aria-label={title}>
          <span className="sr-only">{title}</span>
        </a>
      ) : null}
      {body}
    </motion.div>
  )
}
