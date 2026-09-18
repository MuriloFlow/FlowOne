import { ATTENDANCE_PHOTO_MAX_LENGTH } from '../../../shared/attendance'

const MAX_EDGE = 1280
const JPEG_QUALITY = 0.72

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function compressAttendancePhoto(file: File): Promise<string> {
  const raw = await readFileAsDataUrl(file)
  return compressAttendanceDataUrl(raw)
}

export function compressAttendanceDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Não foi possível comprimir a foto.'))
        return
      }
      ctx.drawImage(image, 0, 0, width, height)
      const next = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
      if (next.length > ATTENDANCE_PHOTO_MAX_LENGTH) {
        reject(new Error('Uma das fotos ficou grande demais. Tente outra.'))
        return
      }
      resolve(next)
    }
    image.onerror = () => reject(new Error('Não foi possível ler a foto.'))
    image.src = dataUrl
  })
}
