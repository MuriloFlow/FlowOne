import { isMobileShell } from '@/lib/is-mobile-shell'

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
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

/** Baixa no desktop e grava/abre a folha nativa de compartilhamento no app Capacitor. */
export async function exportFile(blob: Blob, filename: string, title: string): Promise<void> {
  if (!isMobileShell()) {
    downloadBlob(blob, filename)
    return
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share')
  ])
  const result = await Filesystem.writeFile({
    path: `FLOW/${filename}`,
    data: await asBase64(blob),
    directory: Directory.Cache,
    recursive: true
  })
  await Share.share({ title, files: [result.uri], dialogTitle: title })
}
