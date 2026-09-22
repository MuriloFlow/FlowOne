import { app, ipcMain } from 'electron'
import log from 'electron-log'
import { createMainWindow, getMainWindow, registerWindowIpc } from './window'
import { clearAuthSession, flushAuthSession, hydrateAuthSession, persistAuthSession, readAuthSession } from './session-store'
import { registerUpdater, startBackgroundUpdater } from './updater'
import { loadLocalEnv } from './env'
import { registerKobbiIpc } from './kobbi'
import { registerOperationsIpc } from './operations'
import type { PersistedAuthSession } from '../shared/ipc'

log.transports.file.level = 'info'

function isPersistedSession(value: unknown): value is PersistedAuthSession {
  if (!value || typeof value !== 'object') return false
  const sessionValue = value as PersistedAuthSession
  return (
    typeof sessionValue.accessToken === 'string' &&
    sessionValue.accessToken.length > 20 &&
    typeof sessionValue.refreshToken === 'string' &&
    sessionValue.refreshToken.length >= 8 &&
    typeof sessionValue.expiresAt === 'number' &&
    typeof sessionValue.sessionId === 'string' &&
    sessionValue.sessionId.length >= 16
  )
}

app.setName('FLOW')
app.setAppUserModelId('com.flow.launcher')

const backgroundStartup = app.isPackaged && process.argv.includes('--background-update')
let appReady = false
let launchWindowRequested = !backgroundStartup

function enableBackgroundUpdateAtLogin(): void {
  if (!app.isPackaged || process.platform !== 'win32') return
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: ['--background-update']
    })
  } catch (error) {
    log.info('[updater] nÃ£o foi possÃ­vel configurar a atualizaÃ§Ã£o em segundo plano', error)
  }
}

function openLauncherWindow(): void {
  launchWindowRequested = true
  if (!appReady) return
  const existing = getMainWindow()
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return
  }
  registerUpdater(createMainWindow())
}

const gotLock = app.isPackaged ? app.requestSingleInstanceLock() : true
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    openLauncherWindow()
  })

  app.whenReady().then(async () => {
    appReady = true
    enableBackgroundUpdateAtLogin()
    loadLocalEnv()
    registerWindowIpc()
    registerOperationsIpc()
    registerKobbiIpc()

    ipcMain.handle('auth:persist-session', async (_event, payload: unknown) => {
      if (!isPersistedSession(payload)) {
        throw new Error('Invalid session payload')
      }
      await persistAuthSession(payload)
    })

    ipcMain.handle('auth:read-session', async () => readAuthSession())
    ipcMain.handle('auth:clear-session', async () => clearAuthSession())

    await hydrateAuthSession()
    if (launchWindowRequested) openLauncherWindow()
    else startBackgroundUpdater()

    app.on('activate', () => {
      openLauncherWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void flushAuthSession()
})

process.on('uncaughtException', (error) => {
  log.error('[main] uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('[main] unhandledRejection', reason)
})
