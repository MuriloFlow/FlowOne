import { app, safeStorage, session } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import log from 'electron-log'
import type { PersistedAuthSession } from '../shared/ipc'

const COOKIE_URL = 'https://flow.local'
const ACCESS_COOKIE = 'flow_access_token'
const REFRESH_COOKIE = 'flow_refresh_token'
const EXPIRES_COOKIE = 'flow_expires_at'

function sessionFilePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'flow-session.bin')
}

function isValidSession(value: unknown): value is PersistedAuthSession {
  if (!value || typeof value !== 'object') return false
  const sessionValue = value as PersistedAuthSession
  return (
    typeof sessionValue.accessToken === 'string' &&
    sessionValue.accessToken.length > 20 &&
    typeof sessionValue.refreshToken === 'string' &&
    sessionValue.refreshToken.length >= 8 &&
    typeof sessionValue.expiresAt === 'number' &&
    Number.isFinite(sessionValue.expiresAt) &&
    typeof sessionValue.sessionId === 'string' &&
    sessionValue.sessionId.length >= 16
  )
}

async function writeCookies(payload: PersistedAuthSession): Promise<void> {
  const electronSession = session.defaultSession
  const accessExpiry = Math.max(payload.expiresAt, Math.floor(Date.now() / 1000) + 60)
  const refreshExpiry = accessExpiry + 60 * 60 * 24 * 30

  await electronSession.cookies.set({
    url: COOKIE_URL,
    name: ACCESS_COOKIE,
    value: payload.accessToken,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expirationDate: accessExpiry
  })

  await electronSession.cookies.set({
    url: COOKIE_URL,
    name: REFRESH_COOKIE,
    value: payload.refreshToken,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expirationDate: refreshExpiry
  })

  await electronSession.cookies.set({
    url: COOKIE_URL,
    name: EXPIRES_COOKIE,
    value: String(payload.expiresAt),
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expirationDate: refreshExpiry
  })
}

async function readCookies(): Promise<PersistedAuthSession | null> {
  const cookies = await session.defaultSession.cookies.get({ url: COOKIE_URL })
  const accessToken = cookies.find((cookie) => cookie.name === ACCESS_COOKIE)?.value
  const refreshToken = cookies.find((cookie) => cookie.name === REFRESH_COOKIE)?.value
  const expiresAtRaw = cookies.find((cookie) => cookie.name === EXPIRES_COOKIE)?.value
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : NaN
  const payload = { accessToken, refreshToken, expiresAt }
  return isValidSession(payload) ? payload : null
}

async function clearCookies(): Promise<void> {
  const electronSession = session.defaultSession
  await Promise.all([
    electronSession.cookies.remove(COOKIE_URL, ACCESS_COOKIE),
    electronSession.cookies.remove(COOKIE_URL, REFRESH_COOKIE),
    electronSession.cookies.remove(COOKIE_URL, EXPIRES_COOKIE)
  ])
}

function writeEncryptedFile(payload: PersistedAuthSession): void {
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('[session] DPAPI/safeStorage unavailable; cookie-only persistence')
    return
  }

  writeFileSync(sessionFilePath(), safeStorage.encryptString(JSON.stringify(payload)))
}

function readEncryptedFile(): PersistedAuthSession | null {
  const filePath = sessionFilePath()
  if (!existsSync(filePath) || !safeStorage.isEncryptionAvailable()) return null

  try {
    const parsed: unknown = JSON.parse(safeStorage.decryptString(readFileSync(filePath)))
    return isValidSession(parsed) ? parsed : null
  } catch (error) {
    log.error('[session] failed to read encrypted session', error)
    return null
  }
}

function clearEncryptedFile(): void {
  const filePath = sessionFilePath()
  if (existsSync(filePath)) rmSync(filePath, { force: true })
}

export async function persistAuthSession(payload: PersistedAuthSession): Promise<void> {
  if (!isValidSession(payload)) {
    throw new Error('Invalid session payload')
  }

  await writeCookies(payload)
  writeEncryptedFile(payload)
}

export async function readAuthSession(): Promise<PersistedAuthSession | null> {
  return readEncryptedFile() ?? (await readCookies())
}

export async function clearAuthSession(): Promise<void> {
  await clearCookies()
  clearEncryptedFile()
}
