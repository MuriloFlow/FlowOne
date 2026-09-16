import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { MonthPoint } from '../../../shared/operations'
import { formatCount } from '@/lib/format'

type CardsChartProps = {
  data: MonthPoint[]
  showGoal?: boolean
}

function ChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const cards = payload.find((item) => item.dataKey === 'cards')?.value ?? 0
  const goal = payload.find((item) => item.dataKey === 'goalValue')?.value

  return (
    <div className="min-w-[168px] rounded-[12px] border border-white/[0.08] bg-[#1C1C1C] px-3.5 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <p className="mb-2 text-[11px] tracking-wide text-[#F0EFEC]/40 uppercase">{label}</p>
      {goal !== undefined && goal !== null ? (
        <div className="mb-1.5 flex items-center justify-between gap-6 text-[12px]">
          <span className="flex items-center gap-2 text-[#F0EFEC]/50">
            <span className="size-1.5 rounded-full bg-[#34D399]" />
            Meta
          </span>
          <span className="text-[#F0EFEC]/80">{formatCount(goal)}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-6 text-[12px]">
        <span className="flex items-center gap-2 text-[#F0EFEC]/50">
          <span className="size-1.5 rounded-full bg-[#8B8DFF]" />
          Cartões
        </span>
        <span className="text-[#F0EFEC]/80">{formatCount(cards)}</span>
      </div>
    </div>
  )
}

export function CardsChart({ data, showGoal = true }: CardsChartProps) {
  const points = data.map((item) => ({
    ...item,
    goalValue: item.goal
  }))

  return (
    <div className="h-[280px] w-full outline-none [&_*]:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
          style={{ outline: 'none' }}
        >
          <defs>
            <linearGradient id="cardsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B8DFF" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#8B8DFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(240,239,236,0.06)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'rgba(240,239,236,0.32)', fontSize: 11 }}
            dy={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'rgba(240,239,236,0.28)', fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(240,239,236,0.08)' }} />
          <Area
            type="monotone"
            dataKey="cards"
            stroke="#8B8DFF"
            strokeWidth={2}
            fill="url(#cardsFill)"
            animationDuration={900}
          />
          {showGoal ? (
            <Line
              type="monotone"
              dataKey="goalValue"
              stroke="#34D399"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              animationDuration={900}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
