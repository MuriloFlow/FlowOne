export function formatCount(value: number): string {
  return value.toLocaleString('pt-BR')
}

export function formatBRLFromCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

export function parseBRLToCents(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round(amount * 100)
}

export function formatBRLInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export function formatDateKey(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value))
}

export function greetingFor(name: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false
    }).format(new Date())
  )
  const first = name.trim().split(/\s+/).find(Boolean) ?? 'por aqui'
  if (hour < 12) return `Bom dia, ${first}`
  if (hour < 18) return `Boa tarde, ${first}`
  return `Boa noite, ${first}`
}

export function percentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

export function formatPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function currentMonthKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date())
}

export function weekdayLabel(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    timeZone: 'America/Sao_Paulo'
  })
    .format(new Date(`${dateKey}T12:00:00-03:00`))
    .replace('.', '')
}

export function weekdayLong(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo'
  }).format(new Date(`${dateKey}T12:00:00-03:00`))
}

export function isSunday(dateKey: string): boolean {
  return new Date(`${dateKey}T12:00:00-03:00`).getDay() === 0
}

export function currentDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

export function shiftMonthKey(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLongLabel(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}
