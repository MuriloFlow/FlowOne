import type { ReactNode } from 'react'
import { AnimatedMoney, AnimatedNumber } from '@/components/animated-number'
import { ValuePending } from '@/components/value-pending'

type MetricCardProps = {
  label: string
  value: number
  hint: string
  icon: ReactNode
  suffix?: string
  empty?: boolean
  money?: boolean
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  suffix,
  empty = false,
  money = false
}: MetricCardProps) {
  return (
    <article className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
      <div className="mb-5 flex items-start justify-between gap-3">
        <p className="text-[13px] text-[#F0EFEC]/42">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.04] text-[#F0EFEC]/35">
          {icon}
        </span>
      </div>
      <p className="flex min-h-7 items-center text-[28px] leading-none tracking-tight text-[#F0EFEC]/92">
        {empty ? (
          <ValuePending />
        ) : money ? (
          <AnimatedMoney cents={value} />
        ) : (
          <AnimatedNumber value={value} />
        )}
        {empty || !suffix ? null : (
          <span className="ml-1 text-[16px] text-[#F0EFEC]/40">{suffix}</span>
        )}
      </p>
      <p className="mt-3 text-[12px] text-[#F0EFEC]/32">{hint}</p>
    </article>
  )
}
