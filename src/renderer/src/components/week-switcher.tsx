import { ChevronLeft, ChevronRight } from 'lucide-react'
import { currentDateKey, mondayOf, shiftWeek, weekRangeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

type WeekSwitcherProps = {
  value: string
  onChange: (weekStart: string) => void
}

export function WeekSwitcher({ value, onChange }: WeekSwitcherProps) {
  const thisWeek = mondayOf(currentDateKey())

  return (
    <div className="inline-flex h-8 items-center rounded-[8px] border border-white/[0.07] bg-white/[0.03]">
      <button
        type="button"
        aria-label="Semana anterior"
        onClick={() => onChange(shiftWeek(value, -1))}
        className="flex size-8 items-center justify-center text-[#F0EFEC]/40 transition-colors hover:text-[#F0EFEC]/75"
      >
        <ChevronLeft className="size-3.5" strokeWidth={1.8} />
      </button>
      <span className="min-w-[168px] px-1 text-center text-[13px] text-[#F0EFEC]/78">
        {weekRangeLabel(value)}
      </span>
      <button
        type="button"
        aria-label="Próxima semana"
        onClick={() => onChange(shiftWeek(value, 1))}
        className="flex size-8 items-center justify-center text-[#F0EFEC]/40 transition-colors hover:text-[#F0EFEC]/75"
      >
        <ChevronRight className="size-3.5" strokeWidth={1.8} />
      </button>
      {value !== thisWeek ? (
        <button
          type="button"
          onClick={() => onChange(thisWeek)}
          className={cn('pr-2.5 text-[11px] text-[#F0EFEC]/40 hover:text-[#F0EFEC]/70')}
        >
          Hoje
        </button>
      ) : null}
    </div>
  )
}
