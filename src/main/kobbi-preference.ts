import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { KOBBI_WIDTH_DEFAULT, KOBBI_WIDTH_MAX, KOBBI_WIDTH_MIN } from '../shared/kobbi'

function preferencePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'kobbi.json')
}

export function clampKobbiWidth(value: unknown): number {
  const width = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(width)) return KOBBI_WIDTH_DEFAULT
  return Math.round(Math.min(KOBBI_WIDTH_MAX, Math.max(KOBBI_WIDTH_MIN, width)))
}

export function readKobbiWidth(): number {
  try {
    if (!existsSync(preferencePath())) return KOBBI_WIDTH_DEFAULT
    const raw = JSON.parse(readFileSync(preferencePath(), 'utf8')) as { width?: unknown }
    return clampKobbiWidth(raw.width)
  } catch {
    return KOBBI_WIDTH_DEFAULT
  }
}

export function writeKobbiWidth(width: number): number {
  const next = clampKobbiWidth(width)
  writeFileSync(preferencePath(), JSON.stringify({ width: next }), 'utf8')
  return next
}
