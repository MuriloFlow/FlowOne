import {
  SCHEDULE_BANDS,
  formatClock,
  bandLabel,
  resolveSchedulePersonTeam,
  scheduleExportLabel,
  scheduleSlotBaseCode,
  scheduleSlotsForTeam,
  weekdayName,
  weekdayShort,
  type ScheduleAssignment,
  type ScheduleBand,
  type ScheduleBoard,
  type ScheduleDay,
  type ScheduleSlot,
  type ScheduleTeam
} from '../../../shared/schedules'
import { formatDateKey } from '@/lib/format'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { exportFile } from '@/lib/native-export'

type ExportSlot = ScheduleSlot & { assignments: ScheduleAssignment[] }
type ExportDay = Omit<ScheduleDay, 'slots'> & { slots: ExportSlot[] }

export type ScheduleExportScope = {
  dateKey?: string | null
}

type Period = {
  id: string
  band: ScheduleBand
  label: string
  sortOrder: number
  startMinutes: number
  endMinutes: number
  timesVary: boolean
}

const BAND_RANK: Record<ScheduleBand, number> = {
  ABERTURA: 0,
  INTERMEDIARIO: 1,
  FECHAMENTO: 2
}

function periodId(slot: Pick<ScheduleSlot, 'band' | 'code' | 'label'>): string {
  return `${slot.band}|${scheduleSlotBaseCode(slot.code)}|${slot.label.trim().toLowerCase()}`
}

function cellText(name: string, extra?: string | null): string {
  return extra ? `${name}  ${extra}` : name
}

function collectPeriods(days: ExportDay[]): Period[] {
  const map = new Map<string, Period & { times: Set<string> }>()
  for (const day of days) {
    for (const slot of day.slots) {
      const id = periodId(slot)
      const timeKey = `${slot.startMinutes}-${slot.endMinutes}`
      const existing = map.get(id)
      if (!existing) {
        map.set(id, {
          id,
          band: slot.band,
          label: slot.label,
          sortOrder: slot.sortOrder,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
          timesVary: false,
          times: new Set([timeKey])
        })
        continue
      }
      existing.times.add(timeKey)
      existing.sortOrder = Math.min(existing.sortOrder, slot.sortOrder)
      existing.timesVary = existing.times.size > 1
    }
  }
  return [...map.values()]
    .map((row) => ({
      id: row.id,
      band: row.band,
      label: row.label,
      sortOrder: row.sortOrder,
      startMinutes: row.startMinutes,
      endMinutes: row.endMinutes,
      timesVary: row.timesVary
    }))
    .sort((left, right) => {
      const band = BAND_RANK[left.band] - BAND_RANK[right.band]
      if (band) return band
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
      if (left.startMinutes !== right.startMinutes) return left.startMinutes - right.startMinutes
      return left.label.localeCompare(right.label, 'pt-BR')
    })
}

function slotForPeriod(day: ExportDay, period: Period): ExportSlot | undefined {
  return day.slots.find((slot) => periodId(slot) === period.id)
}

function peopleForPeriod(day: ExportDay, period: Period): string[] {
  const slot = slotForPeriod(day, period)
  if (!slot) return []
  return slot.assignments.map((item) =>
    cellText(
      item.shortName,
      item.note ||
        (period.timesVary ? `${formatClock(slot.startMinutes)}–${formatClock(slot.endMinutes)}` : null)
    )
  )
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
  if (!text) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(x - 2, y - 16, maxWidth + 2, 22)
  ctx.clip()
  ctx.fillText(text, x, y)
  ctx.restore()
}

/**
 * Gera a imagem da escala sem abrir compartilhamento — usado pela tela de
 * sucesso no mobile, que compartilha (ou oferece download) em seguida.
 */
export async function renderScheduleImage(
  board: ScheduleBoard,
  team: ScheduleTeam,
  scope: ScheduleExportScope = {}
): Promise<{ blob: Blob; filename: string; title: string }> {
  const allowed = new Set(
    board.people.filter((person) => resolveSchedulePersonTeam(person) === team).map((person) => person.id)
  )
  const days = board.days
    .filter((day) => !scope.dateKey || day.dateKey === scope.dateKey)
    .map((day) => ({
      ...day,
      slots: scheduleSlotsForTeam(day.slots, team).map((slot) => ({
        ...slot,
        assignments: slot.assignments.filter((item) => allowed.has(item.collaboratorId))
      }))
    }))
  if (days.length === 0) throw new Error('Não há escala montada para este período ainda.')

  const periods = collectPeriods(days)
  const sections = SCHEDULE_BANDS.map((band) => ({
    band,
    periods: periods.filter((period) => period.band === band)
  })).filter((section) => section.periods.length > 0)

  const colW = days.length === 1 ? 280 : 148
  const labelW = 168
  const rowH = 32
  const headerH = 34
  const bandH = 28
  const pad = 20
  const titleH = 36
  const depths = periods.map((period) =>
    Math.max(1, ...days.map((day) => peopleForPeriod(day, period).length))
  )
  const width = pad * 2 + labelW + days.length * colW
  const height =
    pad * 2 +
    titleH +
    headerH +
    sections.reduce((sum, section) => {
      const sectionDepth = section.periods.reduce((total, period) => {
        const index = periods.indexOf(period)
        return total + (depths[index] ?? 1)
      }, 0)
      return sum + bandH + sectionDepth * rowH
    }, 0) +
    8

  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível gerar a imagem da escala.')
  ctx.scale(2, 2)

  const tableLeft = pad
  const tableRight = width - pad
  const tableWidth = tableRight - tableLeft

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  const single = days[0]
  const headerTitle =
    days.length === 1 && single
      ? `${board.storeName}  ·  ${scheduleExportLabel(team)}  ·  ${weekdayName(single.weekday)} ${formatDateKey(single.dateKey)}`
      : `${board.storeName}  ·  ${scheduleExportLabel(team)}  ·  Semana ${formatDateKey(board.weekStart)}`

  ctx.font = '600 13px Inter, Segoe UI, sans-serif'
  ctx.fillStyle = '#111111'
  ctx.fillText(headerTitle, pad, pad + 16)

  let y = pad + titleH
  ctx.fillStyle = '#F3F3F0'
  ctx.fillRect(tableLeft, y, tableWidth, headerH)
  ctx.strokeStyle = '#C4C4BE'
  ctx.lineWidth = 1
  ctx.strokeRect(tableLeft, y, tableWidth, headerH)

  ctx.font = '700 11px Inter, Segoe UI, sans-serif'
  ctx.fillStyle = '#33332F'
  ctx.fillText('Período', tableLeft + 10, y + 21)
  ctx.font = '600 11px Inter, Segoe UI, sans-serif'
  days.forEach((day, index) => {
    const x = tableLeft + labelW + index * colW
    ctx.fillText(`${day.shortLabel}. ${formatDateKey(day.dateKey).slice(0, 5)}`, x + 10, y + 21)
  })
  y += headerH

  for (const section of sections) {
    ctx.fillStyle = '#E8E8E3'
    ctx.fillRect(tableLeft, y, tableWidth, bandH)
    ctx.strokeStyle = '#C4C4BE'
    ctx.strokeRect(tableLeft, y, tableWidth, bandH)
    ctx.font = '700 11px Inter, Segoe UI, sans-serif'
    ctx.fillStyle = '#1A1A1A'
    ctx.fillText(bandLabel(section.band).toUpperCase(), tableLeft + 10, y + 18)
    y += bandH

    for (const period of section.periods) {
      const depth = Math.max(1, ...days.map((day) => peopleForPeriod(day, period).length))
      const timeLabel = period.timesVary
        ? 'Horários no dia'
        : `${formatClock(period.startMinutes)} – ${formatClock(period.endMinutes)}`

      for (let row = 0; row < depth; row += 1) {
        ctx.fillStyle = row % 2 === 0 ? '#FFFFFF' : '#F6F6F3'
        ctx.fillRect(tableLeft, y, tableWidth, rowH)
        ctx.strokeStyle = '#D0D0CA'
        ctx.beginPath()
        ctx.moveTo(tableLeft, y + rowH)
        ctx.lineTo(tableRight, y + rowH)
        ctx.stroke()

        if (row === 0) {
          ctx.fillStyle = '#1A1A1A'
          ctx.font = '600 12px Inter, Segoe UI, sans-serif'
          fitText(ctx, period.label, tableLeft + 10, y + 13, labelW - 16)
          ctx.fillStyle = '#5C5C56'
          ctx.font = '500 10px Inter, Segoe UI, sans-serif'
          fitText(ctx, timeLabel, tableLeft + 10, y + 26, labelW - 16)
        }

        days.forEach((day, index) => {
          const people = peopleForPeriod(day, period)
          const text = people[row] ?? ''
          if (!text) return
          ctx.fillStyle = '#1A1A1A'
          ctx.font = '500 12px Inter, Segoe UI, sans-serif'
          fitText(ctx, text, tableLeft + labelW + index * colW + 10, y + 20, colW - 18)
        })
        y += rowH
      }
    }
  }

  ctx.strokeStyle = '#C4C4BE'
  ctx.strokeRect(tableLeft, pad + titleH, tableWidth, y - (pad + titleH))
  ctx.beginPath()
  ctx.moveTo(tableLeft + labelW, pad + titleH)
  ctx.lineTo(tableLeft + labelW, y)
  ctx.stroke()
  days.forEach((_, index) => {
    if (index === 0) return
    const x = tableLeft + labelW + index * colW
    ctx.beginPath()
    ctx.moveTo(x, pad + titleH)
    ctx.lineTo(x, y)
    ctx.stroke()
  })

  const generated = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/png')
  })
  let file = generated
  if (!file) {
    const dataUrl = canvas.toDataURL('image/png')
    const response = await fetch(dataUrl)
    file = await response.blob()
  }
  if (!file || file.size < 32) throw new Error('Não foi possível gerar a imagem da escala.')

  const scopeName =
    days.length === 1 && single
      ? `${single.dateKey}-${weekdayShort(single.weekday)}`
      : board.weekStart
  const filename = `escala-${scheduleExportLabel(team).replace(/\s+/g, '-').toLowerCase()}-${scopeName}.png`
  const title = isMobileShell()
    ? `Escala ${scheduleExportLabel(team)}`
    : 'Exportar escala'
  return { blob: file, filename, title }
}

/**
 * Desktop: gera a imagem, baixa e copia para a área de transferência.
 * No mobile a página usa renderScheduleImage + ExportSuccessSheet para
 * abrir o compartilhamento nativo do celular.
 */
export async function exportScheduleImage(
  board: ScheduleBoard,
  team: ScheduleTeam,
  scope: ScheduleExportScope = {}
): Promise<void> {
  const { blob, filename, title } = await renderScheduleImage(board, team, scope)
  await exportFile(blob, filename, title)

  if (
    !isMobileShell() &&
    navigator.clipboard &&
    'write' in navigator.clipboard &&
    typeof ClipboardItem !== 'undefined'
  ) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => undefined)
  }
}
