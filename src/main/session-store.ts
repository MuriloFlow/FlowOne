import { app, safeStorage, session } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import log from 'electron-log'
import type { PersistedAuthSession } from '../shared/ipc'
import { invalidateMemo } from './memo'

const COOKIE_URL = 'https://flow.local'
const ACCESS_COOKIE = 'flow_access_token'
const REFRESH_COOKIE = 'flow_refresh_token'
const EXPIRES_COOKIE = 'flow_expires_at'
const SESSION_COOKIE = 'flow_session_id'
const PERSIST_SECONDS = 60 * 60 * 24 * 30

let cachedSession: PersistedAuthSession | null = null
let hydrated = false

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

function remember(payload: PersistedAuthSession | null): PersistedAuthSession | null {
  cachedSession = payload
  hydrated = true
  return payload
}

async function writeCookies(payload: PersistedAuthSession): Promise<void> {
  const electronSession = session.defaultSession
  const persistUntil = Math.floor(Date.now() / 1000) + PERSIST_SECONDS

  await Promise.all([
    electronSession.cookies.set({
      url: COOKIE_URL,
      name: ACCESS_COOKIE,
      value: payload.accessToken,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expirationDate: persistUntil
    }),
    electronSession.cookies.set({
      url: COOKIE_URL,
      name: REFRESH_COOKIE,
      value: payload.refreshToken,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expirationDate: persistUntil
    }),
    electronSession.cookies.set({
      url: COOKIE_URL,
      name: EXPIRES_COOKIE,
      value: String(payload.expiresAt),
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expirationDate: persistUntil
    }),
    electronSession.cookies.set({
      url: COOKIE_URL,
      name: SESSION_COOKIE,
      value: payload.sessionId,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expirationDate: persistUntil
    })
  ])

  try {
    await electronSession.cookies.flushStore()
  } catch (error) {
    log.warn('[session] cookie flush failed', error)
  }
}

async function readCookies(): Promise<PersistedAuthSession | null> {
  const cookies = await session.defaultSession.cookies.get({ url: COOKIE_URL })
  const accessToken = cookies.find((cookie) => cookie.name === ACCESS_COOKIE)?.value
  const refreshToken = cookies.find((cookie) => cookie.name === REFRESH_COOKIE)?.value
  const sessionId = cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value
  const expiresAtRaw = cookies.find((cookie) => cookie.name === EXPIRES_COOKIE)?.value
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : NaN
  const payload = { accessToken, refreshToken, expiresAt, sessionId }
  return isValidSession(payload) ? payload : null
}

async function clearCookies(): Promise<void> {
  const electronSession = session.defaultSession
  await Promise.all([
    electronSession.cookies.remove(COOKIE_URL, ACCESS_COOKIE),
    electronSession.cookies.remove(COOKIE_URL, REFRESH_COOKIE),
    electronSession.cookies.remove(COOKIE_URL, EXPIRES_COOKIE),
    electronSession.cookies.remove(COOKIE_URL, SESSION_COOKIE)
  ])
  try {
    await electronSession.cookies.flushStore()
  } catch (error) {
    log.warn('[session] cookie flush failed', error)
  }
}

function writeEncryptedFile(payload: PersistedAuthSession): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[session] DPAPI/safeStorage unavailable; cookie persistence only')
      return
    }
    writeFileSync(sessionFilePath(), safeStorage.encryptString(JSON.stringify(payload)))
  } catch (error) {
    log.error('[session] failed to write encrypted session', error)
  }
}

function readEncryptedFile(): PersistedAuthSession | null {
  const filePath = sessionFilePath()
  if (!existsSync(filePath)) return null

  try {
    if (!safeStorage.isEncryptionAvailable()) return null
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
  remember(payload)
}

export async function hydrateAuthSession(): Promise<PersistedAuthSession | null> {
  const payload = readEncryptedFile() ?? (await readCookies())
  if (payload) log.info('[session] restored from userData')
  else log.info('[session] no persisted session')
  return remember(payload)
}

export async function readAuthSession(): Promise<PersistedAuthSession | null> {
  if (hydrated) return cachedSession
  return hydrateAuthSession()
}

export async function flushAuthSession(): Promise<void> {
  try {
    await session.defaultSession.cookies.flushStore()
  } catch (error) {
    log.warn('[session] cookie flush failed', error)
  }
}

export async function clearAuthSession(): Promise<void> {
  remember(null)
  await clearCookies()
  clearEncryptedFile()
  invalidateMemo()
}
