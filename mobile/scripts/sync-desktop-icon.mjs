import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const icoPath = resolve(root, 'icons/icon.ico')
const pngPath = resolve(root, 'icons/icon.png')
const logoPath = resolve(root, 'src/renderer/src/assets/logo.png')
const resources = resolve(root, 'mobile/resources')
const extracted = resolve(resources, 'desktop-icon-source.png')

mkdirSync(resources, { recursive: true })

function extractLargestPngFromIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    throw new Error('Arquivo ICO inválido: ' + icoPath)
  }
  const count = buf.readUInt16LE(4)
  let best = null
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16
    const width = buf[off] === 0 ? 256 : buf[off]
    const height = buf[off + 1] === 0 ? 256 : buf[off + 1]
    const size = buf.readUInt32LE(off + 8)
    const offset = buf.readUInt32LE(off + 12)
    const slice = buf.subarray(offset, offset + size)
    const isPng = slice[0] === 0x89 && slice[1] === 0x50 && slice[2] === 0x4e && slice[3] === 0x47
    const score = width * height + (isPng ? 1_000_000 : 0)
    if (!best || score > best.score) best = { width, height, slice, isPng, score }
  }
  if (!best) throw new Error('ICO sem frames: ' + icoPath)
  return best
}

const ico = readFileSync(icoPath)
const frame = extractLargestPngFromIco(ico)
if (frame.isPng) {
  writeFileSync(extracted, frame.slice)
  console.log('ICO frame PNG', frame.width + 'x' + frame.height, frame.slice.length, 'bytes')
} else {
  copyFileSync(pngPath, extracted)
  console.log('ICO sem PNG interno — usei icons/icon.png')
}

copyFileSync(logoPath, resolve(root, 'mobile/src/assets/logo.png'))
console.log('logo.png do desktop copiado para o app')

const ps = `
Add-Type -AssemblyName System.Drawing
$srcPath = '${extracted.replace(/\\/g, '\\\\')}'
$iconPath = '${resolve(resources, 'icon.png').replace(/\\/g, '\\\\')}'
$splashPath = '${resolve(resources, 'splash.png').replace(/\\/g, '\\\\')}'
$src = [System.Drawing.Image]::FromFile($srcPath)
try {
  $icon = New-Object System.Drawing.Bitmap 1024, 1024
  $g = [System.Drawing.Graphics]::FromImage($icon)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 17, 17, 17))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($src, 0, 0, 1024, 1024)
  $g.Dispose()
  $icon.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $icon.Dispose()

  $splash = New-Object System.Drawing.Bitmap 2732, 2732
  $sg = [System.Drawing.Graphics]::FromImage($splash)
  $sg.Clear([System.Drawing.Color]::FromArgb(255, 17, 17, 17))
  $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $size = 1100
  $x = [int]((2732 - $size) / 2)
  $y = [int]((2732 - $size) / 2)
  $sg.DrawImage($src, $x, $y, $size, $size)
  $sg.Dispose()
  $splash.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $splash.Dispose()
} finally {
  $src.Dispose()
}
Write-Host 'Wrote 1024 icon + 2732 splash from desktop mark'
`
const result = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
if (result.status !== 0) {
  console.error(result.stdout, result.stderr)
  process.exit(result.status ?? 1)
}
console.log(result.stdout.trim())
