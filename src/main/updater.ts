import { app, BrowserWindow, ipcMain, net, powerMonitor } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import type { UpdateStatus } from '../shared/ipc'

const CHECK_EVERY_MS = 4_000
const FOCUS_DEBOUNCE_MS = 600
const RETRY_DELAYS_MS = [1_500, 3_000, 8_000]
const BACKGROUND_IDLE_EXIT_MS = 12_000
const GITHUB_TIMEOUT_MS = 8_000
const OWNER = 'MuriloFlow'
const REPO = 'FlowOne'

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.allowDowngrade = false
autoUpdater.allowPrerelease = false
autoUpdater.logger = log
autoUpdater.requestHeaders = {
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
}
Object.assign(autoUpdater, {
  disableWebInstaller: true,
  disableDifferentialDownload: true,
  verifyUpdateCodeSignature: false
})

let currentStatus: UpdateStatus = { state: 'idle' }
let mainWindow: BrowserWindow | null = null
let ipcRegistered = false
let listenersRegistered = false
let checking = false
let lastCheckAt = 0
let closeBound = false
let retryAttempt = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pointedVersion: string | null = null
let backgroundMode = false
let pollingStarted = false
let backgroundExitTimer: ReturnType<typeof setTimeout> | null = null

function isBackgroundOnly(): boolean {
  return backgroundMode && (!mainWindow || mainWindow.isDestroyed())
}

function exitBackgroundWhenIdle(): void {
  if (!isBackgroundOnly() || backgroundExitTimer) return
  backgroundExitTimer = setTimeout(() => {
    backgroundExitTimer = null
    if (isBackgroundOnly() && !isBusy()) app.quit()
  }, BACKGROUND_IDLE_EXIT_MS)
}

function cancelBackgroundExit(): void {
  if (!backgroundExitTimer) return
  clearTimeout(backgroundExitTimer)
  backgroundExitTimer = null
}

function isBusy(status: UpdateStatus = currentStatus): boolean {
  return status.state === 'available' || status.state === 'downloading' || status.state === 'ready'
}

function emit(status: UpdateStatus): void {
  if (currentStatus.state === 'ready' && status.state !== 'ready') return
  if (currentStatus.state === 'downloading' && (status.state === 'idle' || status.state === 'checking')) {
    return
  }
  currentStatus = status
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status)
  }
  if (status.state === 'idle' || status.state === 'error') exitBackgroundWhenIdle()
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus
}

function registerIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('updater:status', () => currentStatus)
  ipcMain.handle('updater:check', async () => {
    await checkForUpdates({ force: true })
    return currentStatus
  })
  ipcMain.handle('updater:install', () => {
    installReadyUpdate()
  })
}

function installReadyUpdate(): void {
  if (currentStatus.state !== 'ready') return
  autoUpdater.quitAndInstall(true, true)
}

function bindCloseToInstall(window: BrowserWindow): void {
  if (closeBound) return
  closeBound = true
  window.on('close', (event) => {
    if (currentStatus.state !== 'ready') return
    event.preventDefault()
    installReadyUpdate()
  })
}

function clearRetry(): void {
  retryAttempt = 0
  if (!retryTimer) return
  clearTimeout(retryTimer)
  retryTimer = null
}

function scheduleRetry(): void {
  if (retryTimer || isBusy()) return
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)]
  retryAttempt += 1
  log.info(`[updater] nova tentativa em ${delay}ms`)
  retryTimer = setTimeout(() => {
    retryTimer = null
    void checkForUpdates({ force: true })
  }, delay)
}

function versionParts(value: string): number[] {
  return value.replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
}

function isNewer(latest: string, current: string): boolean {
  const left = versionParts(latest)
  const right = versionParts(current)
  const size = Math.max(left.length, right.length)
  for (let index = 0; index < size; index += 1) {
    if ((left[index] ?? 0) > (right[index] ?? 0)) return true
    if ((left[index] ?? 0) < (right[index] ?? 0)) return false
  }
  return false
}

async function githubJson(path: string): Promise<unknown> {
  const response = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FLOW',
      'Cache-Control': 'no-cache'
    },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`GitHub ${response.status} ${path}`)
  return response.json()
}

function releaseHasInstaller(release: { assets?: Array<{ name?: string }> }): boolean {
  const assets = release.assets ?? []
  const hasYml = assets.some((asset) => asset.name === 'latest.yml')
  const hasExe = assets.some(
    (asset) => typeof asset.name === 'string' && /^FLOW-Setup-.*\.exe$/i.test(asset.name) && !asset.name.endsWith('.blockmap')
  )
  return hasYml && hasExe
}

/**
 * Update desktop mais recente publicado (release com latest.yml + Setup.exe).
 * A versão vem SEMPRE do latest.yml (3 partes, ex. 1.3.64) — a tag do release
 * pode ser 1.3.0.65 porque é compartilhada com a OTA mobile. Sem API do
 * GitHub (rate limit/instabilidade), cai para o espelho
 * /releases/latest/download/latest.yml.
 */
async function latestPublishedUpdate(): Promise<{ version: string; feedTag: string } | null> {
  try {
    const releases = (await githubJson('/releases?per_page=10')) as Array<{
      draft?: boolean
      prerelease?: boolean
      tag_name?: string
      assets?: Array<{ name?: string }>
    }>
    for (const release of releases) {
      if (release.draft || release.prerelease) continue
      if (!release.tag_name) continue
      if (!releaseHasInstaller(release)) continue
      const ymlVersion = await fetchLatestYmlVersion(release.tag_name).catch(() => null)
      return { version: ymlVersion ?? release.tag_name.replace(/^v/i, ''), feedTag: release.tag_name }
    }
    return null
  } catch (error) {
    log.info('[updater] API GitHub indisponível, usando fallback:', error instanceof Error ? error.message : error)
  }

  try {
    const version = await fetchLatestYmlVersion('latest')
    if (version) return { version, feedTag: 'latest' }
  } catch (error) {
    log.info('[updater] fallback latest.yml falhou:', error instanceof Error ? error.message : error)
  }
  return null
}

function parseLatestYmlVersion(text: string): string | null {
  return text.replace(/^\uFEFF/, '').match(/^version:\s*['"]?([^\s'"]+)/m)?.[1] ?? null
}

async function fetchLatestYmlVersion(feedTag: string): Promise<string> {
  const url =
    feedTag === 'latest'
      ? `https://github.com/${OWNER}/${REPO}/releases/latest/download/latest.yml`
      : `https://github.com/${OWNER}/${REPO}/releases/download/${feedTag}/latest.yml`
  const response = await net.fetch(url, {
    headers: { 'User-Agent': 'FLOW', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`latest.yml HTTP ${response.status}`)
  const version = parseLatestYmlVersion(await response.text())
  if (!version) throw new Error('latest.yml sem versão')
  return version
}

function pointFeedAt(feedTag: string): void {
  if (pointedVersion === feedTag) return
  pointedVersion = feedTag
  const url =
    feedTag === 'latest'
      ? `https://github.com/${OWNER}/${REPO}/releases/latest/download`
      : `https://github.com/${OWNER}/${REPO}/releases/download/${feedTag}`
  autoUpdater.setFeedURL({ provider: 'generic', url })
  log.info(`[updater] feed ${feedTag}`)
}

function registerListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  autoUpdater.on('update-available', (info) => {
    cancelBackgroundExit()
    clearRetry()
    if (currentStatus.state === 'ready') return
    emit({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    clearRetry()
    if (isBusy()) return
    emit({ state: 'idle' })
  })

  autoUpdater.on('download-progress', (progress) => {
    cancelBackgroundExit()
    if (currentStatus.state === 'ready') return
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    clearRetry()
    emit({ state: 'ready', version: info.version })
    if (isBackgroundOnly()) {
      log.info('[updater] instalando atualizaÃ§Ã£o silenciosamente em segundo plano')
      setTimeout(() => {
        if (isBackgroundOnly() && currentStatus.state === 'ready') {
          autoUpdater.quitAndInstall(true, false)
        }
      }, 600)
    }
  })

  autoUpdater.on('error', (error) => {
    const message = error?.message ?? 'Falha ao verificar atualizações'
    if (isBusy()) {
      log.info('[updater] ignored during download:', message)
      return
    }
    const ignorable =
      /No published versions|Cannot find latest|404|is not signed|skip checkForUpdates|app is not packed/i.test(
        message
      )
    if (ignorable) {
      log.info('[updater] ignored:', message)
      emit({ state: 'idle' })
      scheduleRetry()
      return
    }
    log.error('[updater]', error)
    emit({ state: 'error', message: 'Não foi possível verificar atualizações agora.' })
    scheduleRetry()
  })
}

function startUpdater(background: boolean): void {
  backgroundMode = background && (!mainWindow || mainWindow.isDestroyed())

  if (!app.isPackaged) {
    emit({ state: 'idle' })
    return
  }

  registerListeners()
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: OWNER,
    repo: REPO
  })

  void checkForUpdates({ force: true })
  if (backgroundMode || pollingStarted) return
  pollingStarted = true
  setInterval(() => {
    if (!net.isOnline()) return
    void checkForUpdates()
  }, CHECK_EVERY_MS)
  app.on('browser-window-focus', () => void checkForUpdates())
  powerMonitor.on('resume', () => void checkForUpdates({ force: true }))
  powerMonitor.on('unlock-screen', () => void checkForUpdates({ force: true }))
}

/** Inicia o download sem criar BrowserWindow; usado apenas pelo auto-start do Windows. */
export function startBackgroundUpdater(): void {
  startUpdater(true)
}

export function registerUpdater(window: BrowserWindow): void {
  mainWindow = window
  backgroundMode = false
  cancelBackgroundExit()
  registerIpc()
  bindCloseToInstall(window)
  startUpdater(false)
}

export async function checkForUpdates(options?: { force?: boolean }): Promise<void> {
  if (!app.isPackaged) {
    emit({ state: 'idle' })
    return
  }
  if (!net.isOnline()) return
  if (checking || currentStatus.state === 'ready' || currentStatus.state === 'downloading') return
  const now = Date.now()
  if (!options?.force && now - lastCheckAt < FOCUS_DEBOUNCE_MS) return
  lastCheckAt = now
  checking = true
  try {
    const latest = await latestPublishedUpdate().catch(() => null)
    const current = app.getVersion()
    if (latest && isNewer(latest.version, current)) {
      pointFeedAt(latest.feedTag)
    }
    await autoUpdater.checkForUpdates()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.info('[updater] check skipped:', message)
    if (!isBusy()) {
      emit({ state: 'idle' })
      scheduleRetry()
    }
  } finally {
    checking = false
  }
}
