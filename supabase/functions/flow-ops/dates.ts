const TIME_ZONE = 'America/Sao_Paulo'

export function dateKeyInSaoPaulo(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7)
}

export function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00-03:00`)
  date.setDate(date.getDate() + days)
  return dateKeyInSaoPaulo(date)
}

export function lastDayOfMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function saoPauloBounds(startDateKey: string, endDateKey: string): { start: string; end: string } {
  return {
    start: new Date(`${startDateKey}T00:00:00-03:00`).toISOString(),
    end: new Date(`${endDateKey}T23:59:59.999-03:00`).toISOString()
  }
}

export function dayBounds(dateKey: string): { start: string; end: string } {
  return saoPauloBounds(dateKey, dateKey)
}

export function monthBounds(monthKey: string): { start: string; end: string } {
  const lastDay = String(lastDayOfMonth(monthKey)).padStart(2, '0')
  return saoPauloBounds(`${monthKey}-01`, `${monthKey}-${lastDay}`)
}

export function shiftMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function lastTwelveMonthKeys(monthKey: string): string[] {
  return Array.from({ length: 12 }, (_, index) => shiftMonth(monthKey, index - 11))
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)))
  return label.replace('.', '').replace(' de ', '/')
}

export function daysElapsedInMonth(dateKey: string): number {
  return Number(dateKey.slice(8, 10))
}

export function dateKeyFromIso(iso: string): string {
  return dateKeyInSaoPaulo(new Date(iso))
}

export function isoFromDateKey(dateKey: string, endOfDay = false): string {
  return new Date(`${dateKey}T${endOfDay ? '23:59:59.999' : '12:00:00'}-03:00`).toISOString()
}

export function weekdayInSaoPaulo(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00-03:00`).getDay()
}

export function workingDaysInMonth(monthKey: string, fromDateKey?: string): number {
  const last = lastDayOfMonth(monthKey)
  const start =
    fromDateKey && fromDateKey.startsWith(monthKey) ? Number(fromDateKey.slice(8, 10)) : 1
  let count = 0
  for (let day = start; day <= last; day += 1) {
    const key = `${monthKey}-${String(day).padStart(2, '0')}`
    if (weekdayInSaoPaulo(key) !== 0) count += 1
  }
  return count
}

export function mondayOf(dateKey: string): string {
  const dow = weekdayInSaoPaulo(dateKey)
  const offset = dow === 0 ? -6 : 1 - dow
  return shiftDateKey(dateKey, offset)
}

export function shiftWeek(weekStart: string, offset: number): string {
  return shiftDateKey(mondayOf(weekStart), offset * 7)
}

export function weekDateKeys(weekStart: string): string[] {
  const monday = mondayOf(weekStart)
  return Array.from({ length: 7 }, (_, index) => shiftDateKey(monday, index))
}

export function isoWeekday(dateKey: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const dow = weekdayInSaoPaulo(dateKey)
  return (dow === 0 ? 7 : dow) as 1 | 2 | 3 | 4 | 5 | 6 | 7
}

export { voucherPeriodKey } from './_shared/vouchers.ts'
