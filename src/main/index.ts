import { app, ipcMain } from 'electron'
import log from 'electron-log'
import { createMainWindow, getMainWindow, registerWindowIpc } from './window'
import { clearAuthSession, persistAuthSession, readAuthSession } from './session-store'
import { registerUpdater } from './updater'
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

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.whenReady().then(() => {
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

    const window = createMainWindow()
    registerUpdater(window)

    app.on('activate', () => {
      const existing = getMainWindow()
      if (existing) {
        existing.focus()
        return
      }
      registerUpdater(createMainWindow())
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (error) => {
  log.error('[main] uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('[main] unhandledRejection', reason)
})
