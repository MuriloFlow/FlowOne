import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { app } from 'electron'

function applyEnvFile(file: string): void {
  const text = readFileSync(file, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function packagedEnvFiles(): string[] {
  const files: string[] = []
  try {
    files.push(resolve(app.getPath('userData'), 'env.local'))
    files.push(resolve(app.getPath('userData'), '.env.local'))
  } catch {
    // app path is only available after ready
  }

  if (process.resourcesPath) {
    files.push(resolve(process.resourcesPath, 'env.local'))
    files.push(resolve(process.resourcesPath, '.env.local'))
  }

  files.push(resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env'))

  if (app.isReady()) {
    files.push(resolve(app.getAppPath(), 'env.local'))
    files.push(resolve(app.getAppPath(), '.env.local'))
  }

  return files
}

export function loadLocalEnv(): void {
  for (const file of packagedEnvFiles()) {
    if (existsSync(file)) applyEnvFile(file)
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Variável ${name} ausente no .env.local`)
  }
  return value
}
