import { isMobileShell } from '@/lib/is-mobile-shell'

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-')
  return base.replace(/^\.+/, '') || `flow-${Date.now()}`
}

function mimeFor(filename: string, blob: Blob): string {
  if (blob.type && blob.type !== 'application/octet-stream') return blob.type
  if (/\.pdf$/i.test(filename)) return 'application/pdf'
  if (/\.png$/i.test(filename)) return 'image/png'
  if (/\.jpe?g$/i.test(filename)) return 'image/jpeg'
  return blob.type || 'application/octet-stream'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000)
}

async function asBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      const marker = value.indexOf(',')
      if (marker < 0) reject(new Error('Não foi possível preparar o arquivo.'))
      else resolve(value.slice(marker + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo.'))
    reader.readAsDataURL(blob)
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '')
}

function isShareCanceled(error: unknown): boolean {
  return /share canceled|sharing canceled|user.?cancel|cancelad|abort/i.test(errorMessage(error))
}

function isPluginMissing(error: unknown): boolean {
  return /plugin is not implemented|UNIMPLEMENTED|not implemented on/i.test(errorMessage(error))
}

function ensureFileUri(uri: string): string {
  if (uri.startsWith('file:')) return uri
  if (uri.startsWith('/')) return `file://${uri}`
  return uri
}

async function isNativeCapacitor(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

async function pluginAvailable(name: string): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isPluginAvailable(name)
  } catch {
    return false
  }
}

type ShareResult = 'ok' | 'cancel' | 'fail'

/**
 * Compartilha via Web Share API (funciona no Android WebView sem plugin Filesystem).
 * É o caminho principal quando o APK instalado não tem o plugin nativo.
 */
async function shareViaWebApi(blob: Blob, filename: string, title: string): Promise<ShareResult> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'fail'

  const type = mimeFor(filename, blob)
  const file = new File([blob], filename, { type })
  const withFiles = { files: [file], title, text: title }

  if (typeof navigator.canShare === 'function') {
    try {
      if (navigator.canShare(withFiles)) {
        await navigator.share(withFiles)
        return 'ok'
      }
    } catch (error) {
      if (isShareCanceled(error)) return 'cancel'
    }
  }

  // Vários WebViews no Android reportam canShare=false mesmo suportando arquivos.
  try {
    await navigator.share(withFiles)
    return 'ok'
  } catch (error) {
    if (isShareCanceled(error)) return 'cancel'
    return 'fail'
  }
}

async function shareViaBlobUrl(blob: Blob, title: string): Promise<ShareResult> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'fail'
  const url = URL.createObjectURL(blob)
  try {
    await navigator.share({ title, text: title, url })
    return 'ok'
  } catch (error) {
    if (isShareCanceled(error)) return 'cancel'
    return 'fail'
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }
}

async function shareViaFilesystem(
  blob: Blob,
  filename: string,
  title: string
): Promise<'ok' | 'missing' | 'fail'> {
  if (!(await pluginAvailable('Filesystem')) || !(await pluginAvailable('Share'))) {
    return 'missing'
  }

  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share')
    ])

    const path = `FLOW/exports/${Date.now()}-${filename}`
    let uri = ''

    try {
      const written = await Filesystem.writeFile({
        path,
        data: await asBase64(blob),
        directory: Directory.Cache,
        recursive: true
      })
      uri = ensureFileUri(written.uri)
    } catch (writeError) {
      if (isPluginMissing(writeError)) return 'missing'
      try {
        const written = await Filesystem.writeFile({
          path,
          data: await asBase64(blob),
          directory: Directory.Data,
          recursive: true
        })
        uri = ensureFileUri(written.uri)
      } catch (fallbackError) {
        if (isPluginMissing(fallbackError)) return 'missing'
        return 'fail'
      }
    }

    if (!uri.startsWith('file:')) return 'fail'

    try {
      await Share.share({
        title,
        text: title,
        files: [uri],
        dialogTitle: title
      })
      return 'ok'
    } catch (shareError) {
      if (isShareCanceled(shareError)) return 'ok'
      if (isPluginMissing(shareError)) return 'missing'
      try {
        await Share.share({ title, url: uri, dialogTitle: title })
        return 'ok'
      } catch (urlError) {
        if (isShareCanceled(urlError)) return 'ok'
        return 'fail'
      }
    }
  } catch (error) {
    if (isPluginMissing(error)) return 'missing'
    return 'fail'
  }
}

/**
 * Desktop: download no navegador/Electron.
 * Mobile: abre o compartilhamento nativo (WhatsApp etc.) com o arquivo — sem baixar antes.
 */
export async function exportFile(blob: Blob, filename: string, title: string): Promise<void> {
  const safeName = sanitizeFilename(filename)
  const typed = blob.type ? blob : new Blob([blob], { type: mimeFor(safeName, blob) })

  if (!isMobileShell()) {
    downloadBlob(typed, safeName)
    return
  }

  // 1) Web Share com File — funciona nativo no Android mesmo sem @capacitor/filesystem
  const webFile = await shareViaWebApi(typed, safeName, title)
  if (webFile === 'ok' || webFile === 'cancel') return

  // 2) Web Share com URL do blob (fallback em WebViews mais antigos)
  const webUrl = await shareViaBlobUrl(typed, title)
  if (webUrl === 'ok' || webUrl === 'cancel') return

  // 3) Plugins nativos (APKs com Filesystem/Share)
  if (await isNativeCapacitor()) {
    const native = await shareViaFilesystem(typed, safeName, title)
    if (native === 'ok') return
  }

  throw new Error('Não foi possível abrir o compartilhamento. Atualize o app FLOW e tente de novo.')
}
