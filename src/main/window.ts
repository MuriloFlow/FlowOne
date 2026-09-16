import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const WINDOW_WIDTH = 1680
export const WINDOW_HEIGHT = 900
export const WINDOW_BACKGROUND = '#111111'

let mainWindow: BrowserWindow | null = null

function resolveWindowIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, 'build', 'icon.ico'),
    join(app.getAppPath(), 'build', 'icon.ico'),
    join(app.getAppPath(), 'icon.ico'),
    join(process.cwd(), 'build', 'icon.ico'),
    join(process.cwd(), 'icons', 'icon.ico'),
    join(__dirname, '../../build/icon.ico'),
    join(__dirname, '../../icons/icon.ico')
  ]

  return candidates.find((path) => existsSync(path))
}

function loadWindowIcon() {
  const iconPath = resolveWindowIcon()
  if (!iconPath) return undefined
  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? undefined : image
}

function emitWindowState(window: BrowserWindow): void {
  window.webContents.send('window:state', { isMaximized: window.isMaximized() })
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: WINDOW_BACKGROUND,
    frame: false,
    transparent: false,
    show: false,
    autoHideMenuBar: true,
    title: 'FLOW',
    icon: loadWindowIcon(),
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    const icon = loadWindowIcon()
    if (icon) mainWindow?.setIcon(icon)
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => {
    if (mainWindow) emitWindowState(mainWindow)
  })

  mainWindow.on('unmaximize', () => {
    if (mainWindow) emitWindowState(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function registerWindowIpc(): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return { isMaximized: false }
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return { isMaximized: mainWindow.isMaximized() }
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window:state', () => ({
    isMaximized: Boolean(mainWindow?.isMaximized())
  }))
}
