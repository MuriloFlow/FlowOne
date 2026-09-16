import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import type { UpdateStatus } from '../shared/ipc'

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.allowDowngrade = false
autoUpdater.logger = log
;(autoUpdater as { verifyUpdateCodeSignature?: boolean }).verifyUpdateCodeSignature = false

let currentStatus: UpdateStatus = { state: 'idle' }
let mainWindow: BrowserWindow | null = null
let ipcRegistered = false
let listenersRegistered = false

function emit(status: UpdateStatus): void {
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
    if (currentStatus.state !== 'ready') return
    autoUpdater.quitAndInstall(false, true)
  })
}

function registerListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  autoUpdater.on('checking-for-update', () => {
    emit({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    emit({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    emit({ state: 'idle' })
  })

  autoUpdater.on('download-progress', (progress) => {
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    emit({ state: 'ready', version: info.version })
  })

  autoUpdater.on('error', (error) => {
    const message = error?.message ?? 'Falha ao verificar atualizações'
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

  if (!app.isPackaged) {
    emit({ state: 'idle' })
    return
  }

  registerListeners()
  void checkForUpdates()
  setInterval(() => {
    void checkForUpdates()
  }, 15 * 60 * 1000)
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    emit({ state: 'idle' })
    return
  }

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'MuriloFlow',
      repo: 'FlowOne'
    })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.info('[updater] check skipped:', message)
    emit({ state: 'idle' })
  }
}
