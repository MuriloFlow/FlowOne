import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { normalizeStoreId } from '../shared/store-scope'

function preferencePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'store-filter.json')
}

export function readStorePreference(): string | null {
  try {
    if (!existsSync(preferencePath())) return null
    const raw = JSON.parse(readFileSync(preferencePath(), 'utf8')) as { storeId?: unknown }
    return normalizeStoreId(raw.storeId)
  } catch {
    return null
  }
}

export function writeStorePreference(storeId: string | null): void {
  writeFileSync(preferencePath(), JSON.stringify({ storeId: storeId ?? null }), 'utf8')
}
