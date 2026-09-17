import { formatClock, bandLabel, type ScheduleBand, type ScheduleBoard } from '../../../shared/schedules'
import { formatDateKey } from '@/lib/format'

const BANDS: ScheduleBand[] = ['ABERTURA', 'INTERMEDIARIO', 'FECHAMENTO']

function cellText(name: string, extra?: string | null): string {
  return extra ? `${name} ${extra}` : name
}

export async function exportScheduleImage(board: ScheduleBoard): Promise<void> {
  const days = board.days
  const colW = 148
  const labelW = 132
  const rowH = 28
  const headerH = 36
  const pad = 20
  const sections = BANDS.map((band) => {
    const depth = Math.max(
      1,
      ...days.map((day) =>
        day.slots.filter((slot) => slot.band === band).reduce((sum, slot) => sum + Math.max(1, slot.assignments.length), 0)
      )
    )
    return { band, depth }
  })
  const width = pad * 2 + labelW + days.length * colW
  const height =
    pad * 2 + 28 + sections.reduce((sum, section) => sum + headerH + section.depth * rowH, 0) + 16
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(2, 2)
  ctx.fillStyle = '#F4F4F5'
  ctx.fillRect(0, 0, width, height)
  ctx.font = '600 13px Inter, Segoe UI, sans-serif'
  ctx.fillStyle = '#111111'
  ctx.fillText(`${board.storeName}  ·  escala ${formatDateKey(board.weekStart)}`, pad, pad + 14)

  let y = pad + 28
  for (const section of sections) {
    ctx.fillStyle = '#E8E8EA'
    ctx.fillRect(pad, y, width - pad * 2, headerH)
    ctx.fillStyle = '#111111'
    ctx.font = '700 12px Inter, Segoe UI, sans-serif'
    ctx.fillText(bandLabel(section.band).toUpperCase(), pad + 12, y + 23)
    ctx.font = '600 11px Inter, Segoe UI, sans-serif'
    days.forEach((day, index) => {
      const x = pad + labelW + index * colW
      ctx.fillText(`${day.shortLabel}. ${formatDateKey(day.dateKey).slice(0, 5)}`, x + 10, y + 23)
    })
    y += headerH
    for (let row = 0; row < section.depth; row += 1) {
      ctx.fillStyle = row % 2 === 0 ? '#FFFFFF' : '#F7F7F8'
      ctx.fillRect(pad, y, width - pad * 2, rowH)
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.beginPath()
      ctx.moveTo(pad, y + rowH)
      ctx.lineTo(width - pad, y + rowH)
      ctx.stroke()
      days.forEach((day, index) => {
        const people = day.slots
          .filter((slot) => slot.band === section.band)
          .flatMap((slot) =>
            slot.assignments.map((item) =>
              cellText(item.shortName, item.note || (day.slots.filter((s) => s.band === section.band).length > 1 ? formatClock(slot.startMinutes) : null))
            )
          )
        const text = people[row] ?? ''
        if (!text) return
        ctx.fillStyle = '#1A1A1A'
        ctx.font = '500 12px Inter, Segoe UI, sans-serif'
        ctx.fillText(text, pad + labelW + index * colW + 10, y + 19)
      })
      y += rowH
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `escala-${board.storeName.replace(/\s+/g, '-').toLowerCase()}-${board.weekStart}.png`
  link.click()
  URL.revokeObjectURL(url)
  if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => undefined)
  }
}
