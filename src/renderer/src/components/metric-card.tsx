import type { ReactNode } from 'react'
import { AnimatedMoney, AnimatedNumber } from '@/components/animated-number'
import { ValuePending } from '@/components/value-pending'
import { formatCount, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

type MetricCardProps = {
  label: string
  value: number
  hint: string
  icon: ReactNode
  suffix?: string
  empty?: boolean
  money?: boolean
  percent?: boolean
  compact?: boolean
  goal?: number | null
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  suffix,
  empty = false,
  money = false,
  percent = false,
  compact = false,
  goal = null
}: MetricCardProps) {
  const ratio = goal && goal > 0 ? Math.min(100, (value / goal) * 100) : null

  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]',
        compact ? 'min-h-[108px] px-4 py-3' : 'min-h-[148px] px-5 py-4'
      )}
    >
      <div className={cn('flex items-start justify-between gap-3', compact ? 'mb-3' : 'mb-5')}>
        <p className="text-[13px] text-[#F0EFEC]/42">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.04] text-[#F0EFEC]/35">
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'flex min-h-7 items-center leading-none tracking-tight text-[#F0EFEC]/92',
          compact ? 'text-[22px]' : 'text-[28px]'
        )}
      >
        {empty ? (
          <ValuePending />
        ) : money ? (
          <AnimatedMoney cents={value} />
        ) : percent ? (
          formatPercent(value) ?? '—'
        ) : (
          <AnimatedNumber value={value} />
        )}
        {empty || !suffix ? null : (
          <span className="ml-1 text-[16px] text-[#F0EFEC]/40">{suffix}</span>
        )}
      </p>
      {goal !== null ? (
        <div className="mt-auto pt-3">
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-[#F0EFEC]/80"
              style={{ width: `${Math.max(ratio ?? 0, value > 0 ? 4 : 0)}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] leading-snug text-[#F0EFEC]/32">
            {empty
              ? hint
              : `Meta ${formatCount(goal)} · ${ratio === null ? hint : `${Math.round(ratio)}%`}`}
          </p>
        </div>
      ) : (
        <p className="mt-auto pt-3 text-[12px] leading-snug text-[#F0EFEC]/32">{hint}</p>
      )}
    </article>
  )
}
