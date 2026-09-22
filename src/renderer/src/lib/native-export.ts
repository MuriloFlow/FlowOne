import { isMobileShell } from '@/lib/is-mobile-shell'

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[\\/:*?\"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-')
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

/**
 * O Android encerra a folha de compartilhar se nada responder — e um Share.share
 * pendurado deixaria o botão carregando para sempre. Limitamos a espera.
 */
function withShareTimeout<T>(promise: Promise<T>, ms = 180_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('O compartilhamento não respondeu.')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

type ShareResult = 'ok' | 'cancel' | 'missing' | 'fail'

/**
 * Caminho principal no APK: grava em cache via plugin nativo e abre a folha de
 * compartilhar do Android com o arquivo (WhatsApp, Telegram, e-mail etc.).
 * Independente do suporte da WebView à Web Share API.
 */
async function shareViaNativePlugins(blob: Blob, filename: string, title: string): Promise<ShareResult> {
  if (!(await pluginAvailable('Filesystem')) || !(await pluginAvailable('Share'))) return 'missing'

  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share')
    ])

    const path = `FLOW/exports/${Date.now()}-${filename}`
    const payload = await asBase64(blob)
    let uri = ''
    let writeFailure: unknown = null

    for (const directory of [Directory.Cache, Directory.Data]) {
      try {
        const written = await Filesystem.writeFile({ path, data: payload, directory, recursive: true })
        uri = ensureFileUri(written.uri)
        if (uri.startsWith('file:')) break
        writeFailure = new Error(`URI inesperada do arquivo: ${written.uri}`)
      } catch (error) {
        if (isPluginMissing(error)) return 'missing'
        writeFailure = error
      }
    }

    if (!uri.startsWith('file:')) {
      console.warn('[flow-export] gravar arquivo falhou', errorMessage(writeFailure))
      return 'fail'
    }

    try {
      await withShareTimeout(Share.share({ title, text: title, files: [uri], dialogTitle: title }))
      return 'ok'
    } catch (shareError) {
      if (isShareCanceled(shareError)) return 'cancel'
      if (isPluginMissing(shareError)) return 'missing'
      console.warn('[flow-export] Share.share(files) falhou', errorMessage(shareError))
      try {
        await withShareTimeout(Share.share({ title, url: uri, dialogTitle: title }))
        return 'ok'
      } catch (urlError) {
        if (isShareCanceled(urlError)) return 'cancel'
        console.warn('[flow-export] Share.share(url) falhou', errorMessage(urlError))
        return 'fail'
      }
    }
  } catch (error) {
    if (isPluginMissing(error)) return 'missing'
    console.warn('[flow-export] compartilhamento nativo falhou', errorMessage(error))
    return 'fail'
  }
}

/**
 * Web Share API com File — funciona no WebView quando o APK não tem os plugins
 * nativos (instalações antigas recebendo atualização OTA).
 */
async function shareViaWebApi(blob: Blob, filename: string, title: string): Promise<ShareResult> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'missing'

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
      console.warn('[flow-export] Web Share (canShare) falhou', errorMessage(error))
    }
  }

  // Vários WebViews no Android reportam canShare=false mesmo suportando arquivos.
  try {
    await navigator.share(withFiles)
    return 'ok'
  } catch (error) {
    if (isShareCanceled(error)) return 'cancel'
    console.warn('[flow-export] Web Share (arquivo) falhou', errorMessage(error))
    return 'fail'
  }
}

async function shareViaBlobUrl(blob: Blob, title: string): Promise<ShareResult> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'missing'
  const url = URL.createObjectURL(blob)
  try {
    await navigator.share({ title, text: title, url })
    return 'ok'
  } catch (error) {
    if (isShareCanceled(error)) return 'cancel'
    console.warn('[flow-export] Web Share (url) falhou', errorMessage(error))
    return 'fail'
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }
}

/**
 * Abre o compartilhamento nativo do celular com o arquivo pronto.
 * Cancelar a folha do Android NÃO é erro — a promessa resolve normalmente.
 */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<void> {
  const safeName = sanitizeFilename(filename)
  const typed = blob.type ? blob : new Blob([blob], { type: mimeFor(safeName, blob) })

  const strategies: Array<[string, () => Promise<ShareResult>]> = []
  if (await isNativeCapacitor()) {
    strategies.push(['nativo', () => shareViaNativePlugins(typed, safeName, title)])
  }
  strategies.push(['web-arquivo', () => shareViaWebApi(typed, safeName, title)])
  strategies.push(['web-url', () => shareViaBlobUrl(typed, title)])

  const attempts: string[] = []
  for (const [name, run] of strategies) {
    try {
      const result = await run()
      if (result === 'ok' || result === 'cancel') return
      attempts.push(`${name}=${result}`)
    } catch (error) {
      if (isShareCanceled(error)) return
      attempts.push(`${name}=erro:${errorMessage(error).slice(0, 140)}`)
    }
  }

  console.warn('[flow-export] nenhuma estratégia de compartilhamento funcionou:', attempts.join(' | '))
  throw new Error(
    'Não foi possível abrir o compartilhamento neste aparelho. Atualize o app FLOW e tente de novo — ou use a opção de baixar o arquivo.'
  )
}

export type SavedFile = { uri: string; location: string }

/**
 * Salva o arquivo no armazenamento do celular (opção "Baixar"), com fallback
 * entre pastas — app-specific não exige permissão nenhuma no Android moderno.
 */
export async function saveToDevice(blob: Blob, filename: string): Promise<SavedFile> {
  const safeName = sanitizeFilename(filename)
  const typed = blob.type ? blob : new Blob([blob], { type: mimeFor(safeName, blob) })

  if (!(await isNativeCapacitor())) {
    downloadBlob(typed, safeName)
    return { uri: '', location: 'Downloads' }
  }

  let FilesystemModule: typeof import('@capacitor/filesystem')
  try {
    FilesystemModule = await import('@capacitor/filesystem')
  } catch (error) {
    if (isPluginMissing(error)) {
      throw new Error('Esta versão do app não tem o módulo de arquivos. Atualize o FLOW e tente de novo.')
    }
    throw new Error('Não foi possível salvar o arquivo no celular agora.')
  }

  const { Filesystem, Directory } = FilesystemModule
  const payload = await asBase64(typed)
  const candidates: Array<{ directory: import('@capacitor/filesystem').Directory; location: string }> = [
    { directory: Directory.Documents, location: 'Documentos/FLOW' },
    { directory: Directory.External, location: 'Arquivos do FLOW' },
    { directory: Directory.Cache, location: 'Arquivos do FLOW (temporário)' }
  ]

  let lastFailure: unknown = null
  for (const candidate of candidates) {
    try {
      const written = await Filesystem.writeFile({
        path: `FLOW/${safeName}`,
        data: payload,
        directory: candidate.directory,
        recursive: true
      })
      return { uri: written.uri, location: candidate.location }
    } catch (error) {
      if (isPluginMissing(error)) {
        lastFailure = error
        break
      }
      lastFailure = error
    }
  }

  console.warn('[flow-export] salvar arquivo falhou', errorMessage(lastFailure))
  throw new Error(
    'Não foi possível salvar no celular agora. Use a opção "Compartilhar" para enviar o arquivo ao app que quiser.'
  )
}

/**
 * Desktop: download no navegador/Electron.
 * Mobile: abre o compartilhamento nativo (WhatsApp etc.) com o arquivo — sem baixar antes.
 */
export async function exportFile(blob: Blob, filename: string, title: string): Promise<void> {
  if (!isMobileShell()) {
    const safeName = sanitizeFilename(filename)
    downloadBlob(blob.type ? blob : new Blob([blob], { type: mimeFor(safeName, blob) }), safeName)
    return
  }
  await shareFile(blob, filename, title)
}
