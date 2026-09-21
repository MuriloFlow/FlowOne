import { isMobileShell } from '@/lib/is-mobile-shell'

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-')
  return base.replace(/^\.+/, '') || `flow-${Date.now()}`
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
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
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

async function isNativeCapacitor(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function isShareCanceled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /share canceled|sharing canceled|user.?cancel|cancelad/i.test(message)
}

function ensureFileUri(uri: string): string {
  if (uri.startsWith('file:')) return uri
  if (uri.startsWith('/')) return `file://${uri}`
  return uri
}

/**
 * Desktop: download no navegador/Electron.
 * Mobile nativo: grava no cache e abre a folha de compartilhar (WhatsApp, Drive, Arquivos…).
 * Cancelar o compartilhar não é erro — o arquivo já foi gerado.
 */
export async function exportFile(blob: Blob, filename: string, title: string): Promise<void> {
  const safeName = sanitizeFilename(filename)

  if (!isMobileShell() || !(await isNativeCapacitor())) {
    downloadBlob(blob, safeName)
    return
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share')
  ])

  const path = `FLOW/exports/${Date.now()}-${safeName}`
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
    // Fallback: Data dir (ainda compartilhavel via FileProvider files-path)
    try {
      const written = await Filesystem.writeFile({
        path,
        data: await asBase64(blob),
        directory: Directory.Data,
        recursive: true
      })
      uri = ensureFileUri(written.uri)
    } catch {
      throw writeError instanceof Error
        ? writeError
        : new Error('Não foi possível salvar o arquivo no aparelho.')
    }
  }

  if (!uri.startsWith('file:')) {
    // Webview Capacitor sem path nativo — volta para download
    downloadBlob(blob, safeName)
    return
  }

  try {
    await Share.share({
      title,
      text: title,
      files: [uri],
      dialogTitle: title
    })
  } catch (shareError) {
    if (isShareCanceled(shareError)) return
    // Último recurso: tenta abrir só o arquivo via share url
    try {
      await Share.share({
        title,
        url: uri,
        dialogTitle: title
      })
    } catch (fallbackError) {
      if (isShareCanceled(fallbackError)) return
      throw new Error(
        shareError instanceof Error
          ? shareError.message
          : 'Não foi possível abrir o compartilhamento. Tente de novo.'
      )
    }
  }
}
