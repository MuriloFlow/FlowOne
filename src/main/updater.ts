import { app, BrowserWindow, ipcMain, net, powerMonitor } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import type { UpdateStatus } from '../shared/ipc'

const CHECK_EVERY_MS = 8_000
const FOCUS_DEBOUNCE_MS = 1_500
const RETRY_DELAYS_MS = [2_000, 5_000, 12_000]
const FEED_URL = 'https://github.com/MuriloFlow/FlowOne/releases/latest/download'

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
  if (retryTimer || isBusy() || retryAttempt >= RETRY_DELAYS_MS.length) return
  const delay = RETRY_DELAYS_MS[retryAttempt]
  retryAttempt += 1
  log.info(`[updater] nova tentativa em ${delay}ms`)
  retryTimer = setTimeout(() => {
    retryTimer = null
    void checkForUpdates({ force: true })
  }, delay)
}

function registerListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  autoUpdater.on('update-available', (info) => {
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
    if (currentStatus.state === 'ready') return
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    clearRetry()
    emit({ state: 'ready', version: info.version })
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

export function registerUpdater(window: BrowserWindow): void {
  mainWindow = window
  registerIpc()
  bindCloseToInstall(window)

  if (!app.isPackaged) {
    emit({ state: 'idle' })
    return
  }

  registerListeners()
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: FEED_URL
  })

  void checkForUpdates({ force: true })
  setInterval(() => {
    if (!net.isOnline()) return
    void checkForUpdates()
  }, CHECK_EVERY_MS)

  app.on('browser-window-focus', () => {
    void checkForUpdates()
  })
  powerMonitor.on('resume', () => {
    void checkForUpdates({ force: true })
  })
  powerMonitor.on('unlock-screen', () => {
    void checkForUpdates({ force: true })
  })
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
