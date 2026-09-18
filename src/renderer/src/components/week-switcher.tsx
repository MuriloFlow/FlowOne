import { ChevronLeft, ChevronRight } from 'lucide-react'
import { currentDateKey, mondayOf, shiftWeek, weekRangeLabel, weekRangeLabelCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

type WeekSwitcherProps = {
  value: string
  onChange: (weekStart: string) => void
  compact?: boolean
  className?: string
}

export function WeekSwitcher({ value, onChange, compact = false, className }: WeekSwitcherProps) {
  const thisWeek = mondayOf(currentDateKey())

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-[8px] border border-white/[0.07] bg-white/[0.03]',
        compact ? 'h-9 min-w-0 w-full' : 'h-8',
        className
      )}
    >
      <button
        type="button"
        aria-label="Semana anterior"
        onClick={() => onChange(shiftWeek(value, -1))}
        className="flex size-8 shrink-0 items-center justify-center text-[#F0EFEC]/40 transition-colors hover:text-[#F0EFEC]/75"
      >
        <ChevronLeft className="size-3.5" strokeWidth={1.8} />
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 px-0.5 text-center text-[#F0EFEC]/78',
          compact ? 'truncate text-[11px] tracking-tight' : 'min-w-[168px] px-1 text-[13px]'
        )}
      >
        {compact ? weekRangeLabelCompact(value) : weekRangeLabel(value)}
      </span>
      <button
        type="button"
        aria-label="Próxima semana"
        onClick={() => onChange(shiftWeek(value, 1))}
        className="flex size-8 shrink-0 items-center justify-center text-[#F0EFEC]/40 transition-colors hover:text-[#F0EFEC]/75"
      >
        <ChevronRight className="size-3.5" strokeWidth={1.8} />
      </button>
      {!compact && value !== thisWeek ? (
        <button
          type="button"
          onClick={() => onChange(thisWeek)}
          className="pr-2.5 text-[11px] text-[#F0EFEC]/40 hover:text-[#F0EFEC]/70"
        >
          Hoje
        </button>
      ) : null}
    </div>
  )
}
