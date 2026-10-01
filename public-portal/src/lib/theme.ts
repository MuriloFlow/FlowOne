// Aplica a personalização (cor primária/secundária + tema) como CSS vars
// derivadas — nada de cor fixa no código: TODAS as classes brand-* e os
// acentos (glow do hero, ring dos inputs, sombras) seguem a cor escolhida.
export type ThemeBranding = {
  theme?: string | null
  primary_color?: string | null
  secondary_color?: string | null
}

const FALLBACK_PRIMARY = '#2EC97E'
const FALLBACK_SECONDARY = '#101014'
const WHITE = '#ffffff'
const BLACK = '#0a0b0f'

function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null
  let hex = String(value).trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return `#${hex.toUpperCase()}`
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ]
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/** Mistura `base` em direção a `target` (amount 0..1). */
function mix(base: string, target: string, amount: number): string {
  const a = hexToRgb(base)
  const b = hexToRgb(target)
  return rgbToHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount
  ])
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const channel = v / 255
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function applyBranding(branding: ThemeBranding): void {
  const root = document.documentElement
  const primary =
    normalizeHex(branding.primary_color) ?? FALLBACK_PRIMARY
  const secondary =
    normalizeHex(branding.secondary_color) ?? FALLBACK_SECONDARY

  // Escala completa da primária (50..950): a UI toda pinta com a cor escolhida.
  const tints: Array<[string, number]> = [
    ['50', 0.93],
    ['100', 0.86],
    ['200', 0.7],
    ['300', 0.46],
    ['400', 0.22]
  ]
  const shades: Array<[string, number]> = [
    ['600', 0.14],
    ['700', 0.26],
    ['800', 0.36],
    ['900', 0.45],
    ['950', 0.62]
  ]
  for (const [key, amount] of tints) {
    root.style.setProperty(`--brand-${key}`, mix(primary, WHITE, amount))
  }
  root.style.setProperty('--brand-500', primary)
  for (const [key, amount] of shades) {
    root.style.setProperty(`--brand-${key}`, mix(primary, BLACK, amount))
  }

  // Contraste sobre a primária (preto em cores muito claras).
  root.style.setProperty(
    '--brand-contrast',
    luminance(primary) > 0.62 ? '#0a0b0f' : '#ffffff'
  )

  // Acentos com alpha (glow, ring dos inputs, sombras, badges suaves).
  const [r, g, b] = hexToRgb(primary)
  root.style.setProperty('--brand-primary', primary)
  root.style.setProperty('--brand-soft', `rgb(${r} ${g} ${b} / 0.10)`)
  root.style.setProperty('--brand-soft-2', `rgb(${r} ${g} ${b} / 0.18)`)
  root.style.setProperty('--brand-ring', `rgb(${r} ${g} ${b} / 0.32)`)
  root.style.setProperty('--brand-glow', `rgb(${r} ${g} ${b} / 0.20)`)
  root.style.setProperty('--brand-shadow', `rgb(${r} ${g} ${b} / 0.30)`)

  // Cor secundária (textos/detalhes) + versão suave.
  root.style.setProperty('--brand-secondary', secondary)
  const [r2, g2, b2] = hexToRgb(secondary)
  root.style.setProperty('--brand-secondary-soft', `rgb(${r2} ${g2} ${b2} / 0.16)`)

  // Tema claro/escuro de TODO o site.
  root.dataset.theme = branding.theme === 'dark' ? 'dark' : 'light'

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', branding.theme === 'dark' ? '#0b0c10' : '#ffffff')
  }
}
