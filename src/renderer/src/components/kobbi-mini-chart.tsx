import type { KobbiChartSpec } from '../../../shared/kobbi'
import { formatBRLFromCents, formatCount, formatPercent } from '@/lib/format'

function formatValue(value: number, unit?: KobbiChartSpec['unit']): string {
  if (unit === 'brl') return formatBRLFromCents(Math.round(value * 100))
  if (unit === 'pu') return formatPercent(value) ?? `${value}`
  return formatCount(Math.round(value))
}

export function KobbiMiniChart({ spec }: { spec: KobbiChartSpec }) {
  const series = spec.series.filter((item) => Number.isFinite(item.value)).slice(0, 16)
  if (series.length < 2) return null

  const width = 292
  const height = 92
  const pad = { top: 10, right: 8, bottom: 22, left: 8 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const max = Math.max(...series.map((item) => item.value), 0.0001)
  const min = spec.type === 'line' ? Math.min(...series.map((item) => item.value), 0) : 0
  const span = Math.max(max - min, 0.0001)

  const points = series.map((item, index) => {
    const x =
      series.length === 1
        ? pad.left + innerW / 2
        : pad.left + (index * innerW) / (series.length - 1)
    const y = pad.top + innerH - ((item.value - min) / span) * innerH
    return { ...item, x, y }
  })

  const barWidth = Math.min(22, Math.max(8, innerW / series.length - 6))

  return (
    <div className="mt-3 w-full max-w-[320px] rounded-[12px] border border-white/[0.06] bg-[#1A1A1A] px-3 pt-2.5 pb-2">
      <p className="mb-1 text-[11px] tracking-wide text-[#F0EFEC]/38">{spec.title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[92px] w-full" role="img" aria-label={spec.title}>
        {spec.type === 'line' ? (
          <>
            <polyline
              fill="none"
              stroke="#8B8DFF"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((item) => `${item.x},${item.y}`).join(' ')}
            />
            {points.map((item) => (
              <circle key={item.label} cx={item.x} cy={item.y} r="2.4" fill="#8B8DFF" />
            ))}
          </>
        ) : (
          points.map((item, index) => {
            const x = pad.left + (index + 0.5) * (innerW / series.length) - barWidth / 2
            const barH = Math.max(2, ((item.value - min) / span) * innerH)
            return (
              <rect
                key={item.label}
                x={x}
                y={pad.top + innerH - barH}
                width={barWidth}
                height={barH}
                rx="3"
                fill="#8B8DFF"
                opacity={0.88}
              />
            )
          })
        )}
        {points.map((item, index) => {
          const x =
            spec.type === 'bar'
              ? pad.left + (index + 0.5) * (innerW / series.length)
              : item.x
          return (
            <text
              key={`l-${item.label}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              fill="rgba(240,239,236,0.32)"
              fontSize="9"
            >
              {item.label}
            </text>
          )
        })}
      </svg>
      <div className="mt-0.5 flex justify-between gap-2 text-[10px] text-[#F0EFEC]/32">
        <span>{formatValue(series[0]?.value ?? 0, spec.unit)}</span>
        <span>{formatValue(series[series.length - 1]?.value ?? 0, spec.unit)}</span>
      </div>
    </div>
  )
}
