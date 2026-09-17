import { ChevronLeft, ChevronRight } from 'lucide-react'
import { currentMonthKey, monthLongLabel, shiftMonthKey } from '@/lib/format'
import { cn } from '@/lib/utils'

type MonthSwitcherProps = {
  value: string
  onChange: (monthKey: string) => void
}

export function MonthSwitcher({ value, onChange }: MonthSwitcherProps) {
  const max = currentMonthKey()
  const canNext = value < max

  return (
    <div className="inline-flex h-8 items-center rounded-[8px] border border-white/[0.07] bg-white/[0.03]">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonthKey(value, -1))}
        className="flex size-8 items-center justify-center text-[#F0EFEC]/40 transition-colors hover:text-[#F0EFEC]/75"
      >
        <ChevronLeft className="size-3.5" strokeWidth={1.8} />
      </button>
      <span className="min-w-[148px] px-1 text-center text-[13px] text-[#F0EFEC]/78">
        {monthLongLabel(value)}
      </span>
      <button
        type="button"
        aria-label="Próximo mês"
        disabled={!canNext}
        onClick={() => onChange(shiftMonthKey(value, 1))}
        className={cn(
          'flex size-8 items-center justify-center transition-colors',
          canNext ? 'text-[#F0EFEC]/40 hover:text-[#F0EFEC]/75' : 'text-[#F0EFEC]/16'
        )}
      >
        <ChevronRight className="size-3.5" strokeWidth={1.8} />
      </button>
    </div>
  )
}
