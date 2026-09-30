import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import {
  APPLICATION_STATUS_META,
  JOB_STATUS_META,
  type RhApplicationStatus,
  type RhJobStatus
} from '@/lib/rh/types'

const ease = [0.22, 1, 0.36, 1] as const

export function RhPageHeader({
  title,
  subtitle,
  action
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] text-[#F0EFEC]/88">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] text-[#F0EFEC]/38">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

const TONE_CLASS: Record<string, string> = {
  green: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200/90',
  amber: 'border-amber-300/20 bg-amber-300/10 text-amber-200/90',
  gray: 'border-white/10 bg-white/[0.05] text-[#F0EFEC]/60',
  blue: 'border-sky-300/20 bg-sky-300/10 text-sky-200/90'
}

export function RhJobStatusChip({ status }: { status: RhJobStatus }) {
  const meta = JOB_STATUS_META[status]
  return (
    <span
      className={cnInline(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
        TONE_CLASS[meta.tone]
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}

export function RhApplicationStatusChip({ status }: { status: RhApplicationStatus }) {
  const meta = APPLICATION_STATUS_META[status]
  return (
    <span className={cnInline('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase', meta.chip)}>
      <span className={cnInline('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function RhCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cnInline('rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]', className)}>
      {children}
    </div>
  )
}

export function RhMetricCard({
  label,
  value,
  hint,
  tone = 'default',
  onClick
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'green' | 'amber' | 'violet' | 'teal'
  onClick?: () => void
}) {
  const accent =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : tone === 'violet'
          ? 'text-violet-300'
          : tone === 'teal'
            ? 'text-teal-300'
            : 'text-[#F0EFEC]/85'
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      whileHover={onClick ? { y: -2 } : undefined}
      className={cnInline(
        'rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] p-4 text-left transition-colors',
        onClick ? 'cursor-pointer hover:border-white/[0.09] hover:bg-[#1E1E1E]' : 'cursor-default'
      )}
    >
      <p className="text-[11px] font-medium tracking-wide text-[#F0EFEC]/35 uppercase">{label}</p>
      <p className={cnInline('mt-2 text-[26px] leading-none font-semibold', accent)}>{value}</p>
      {hint ? <p className="mt-1.5 text-[11px] text-[#F0EFEC]/32">{hint}</p> : null}
    </motion.button>
  )
}

export function RhSkeleton({ className }: { className?: string }) {
  return <div className={cnInline('animate-pulse rounded-[16px] bg-white/4', className)} />
}

export function RhEmptyState({
  title,
  description,
  action
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[16px] border border-dashed border-white/[0.07] bg-[#1A1A1A]/60 px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-[#F0EFEC]/70">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-[12.5px] text-[#F0EFEC]/38">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function RhErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[16px] border border-red-500/15 bg-red-500/8 px-6 py-8 text-center">
      <p className="text-[13.5px] text-red-200/85">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-[8px] border border-white/10 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-[#F0EFEC] transition hover:bg-white/10"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  )
}

export function RhPrimaryButton({
  children,
  onClick,
  disabled,
  className
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cnInline(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111111] transition hover:bg-white disabled:opacity-40',
        className
      )}
    >
      {children}
    </button>
  )
}

export function RhGhostButton({
  children,
  onClick,
  disabled,
  className,
  tone = 'default'
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cnInline(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] font-medium transition disabled:opacity-40',
        tone === 'danger'
          ? 'border-red-400/20 bg-red-400/8 text-red-200/85 hover:bg-red-400/15'
          : 'border-white/[0.08] bg-white/[0.03] text-[#F0EFEC]/70 hover:bg-white/[0.06]',
        className
      )}
    >
      {children}
    </button>
  )
}

function cnInline(...classes: Array<string | undefined>): string {
  return classes.filter((value): value is string => Boolean(value)).join(' ')
}
