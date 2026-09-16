import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import type { UpdateStatus } from '../shared/ipc'

const CHECK_EVERY_MS = 20_000
const FOCUS_DEBOUNCE_MS = 4_000

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.allowDowngrade = false
autoUpdater.logger = log
;(autoUpdater as { verifyUpdateCodeSignature?: boolean }).verifyUpdateCodeSignature = false

let currentStatus: UpdateStatus = { state: 'idle' }
let mainWindow: BrowserWindow | null = null
let ipcRegistered = false
let listenersRegistered = false
let checking = false
let lastCheckAt = 0
let closeBound = false

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
    await checkForUpdates()
    return currentStatus
  })
  ipcMain.handle('updater:install', () => {
    installReadyUpdate()
  })
}

function installReadyUpdate(): void {
  if (currentStatus.state !== 'ready') return
  // Silent + force-run: NSIS /S --updated --force-run, sem o assistente de instalação.
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

function registerListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  autoUpdater.on('update-available', (info) => {
    if (currentStatus.state === 'ready') return
    emit({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    if (isBusy()) return
    emit({ state: 'idle' })
  })

  autoUpdater.on('download-progress', (progress) => {
    if (currentStatus.state === 'ready') return
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
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
      return
    }
    log.error('[updater]', error)
    emit({ state: 'error', message })
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
    provider: 'github',
    owner: 'MuriloFlow',
    repo: 'FlowOne'
  })

  void checkForUpdates()
  setInterval(() => {
    void checkForUpdates()
  }, CHECK_EVERY_MS)

  app.on('browser-window-focus', () => {
    void checkForUpdates()
  })
  powerMonitor.on('resume', () => {
    void checkForUpdates()
  })
  powerMonitor.on('unlock-screen', () => {
    void checkForUpdates()
  })
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    emit({ state: 'idle' })
    return
  }
  if (checking || currentStatus.state === 'ready' || currentStatus.state === 'downloading') return
  const now = Date.now()
  if (now - lastCheckAt < FOCUS_DEBOUNCE_MS) return
  lastCheckAt = now
  checking = true
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.info('[updater] check skipped:', message)
    if (!isBusy()) emit({ state: 'idle' })
  } finally {
    checking = false
  }
}
