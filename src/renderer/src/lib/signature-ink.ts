// Motor de tinta da assinatura — abordagem clássica de app de desenho:
// segmentos desenhados SINCRONAMENTE no pointermove (a tinta nunca some) +
// repintada completa em rAF para manter a qualidade. Largura variável por
// velocidade, pontas arredondadas, cor preta sólida.

export type InkPoint = { x: number; y: number; p: number }

export type StrokePointNormalized = { x: number; y: number; m?: 1 }

function clampInk(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const TAU = Math.PI * 2
const INK_COLOR = '#121212'

function radiusFor(cur: InkPoint, prev: InkPoint | null, size: number): number {
  const dist = prev ? Math.hypot(cur.x - prev.x, cur.y - prev.y) : 0
  const speed = clampInk(1 - dist / 48, 0.3, 1)
  const pressure = clampInk(cur.p || 0.62, 0.35, 1)
  const t = 0.55 * speed + 0.45 * pressure
  return Math.max(0.7, (size / 2) * (0.55 + 0.45 * t))
}

/** Desenha o segmento [a..b] com cápsula + discos nas pontas (sem gaps). */
function drawSegment(
  ctx: CanvasRenderingContext2D,
  a: InkPoint,
  b: InkPoint,
  size: number
): void {
  const rA = radiusFor(a, null, size)
  const rB = radiusFor(b, a, size)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  ctx.beginPath()
  ctx.arc(a.x, a.y, rA, angle + Math.PI / 2, angle - Math.PI / 2)
  ctx.arc(b.x, b.y, rB, angle - Math.PI / 2, angle + Math.PI / 2)
  ctx.closePath()
  ctx.fill()
  // Disco extra garante tinta mesmo em pontos quase parados.
  ctx.beginPath()
  ctx.arc(b.x, b.y, rB, 0, TAU)
  ctx.fill()
}

function dot(ctx: CanvasRenderingContext2D, at: InkPoint, size: number): void {
  ctx.beginPath()
  ctx.arc(at.x, at.y, radiusFor(at, null, size), 0, TAU)
  ctx.fill()
}

function strokePath(points: InkPoint[], size: number): Path2D | null {
  if (points.length === 0) return null
  if (points.length === 1) {
    const path = new Path2D()
    path.arc(points[0].x, points[0].y, radiusFor(points[0], null, size), 0, TAU)
    return path
  }
  const path = new Path2D()
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const rA = radiusFor(a, null, size)
    const rB = radiusFor(b, a, size)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    path.moveTo(a.x, a.y)
    path.arc(a.x, a.y, rA, angle + Math.PI / 2, angle - Math.PI / 2)
    path.arc(b.x, b.y, rB, angle - Math.PI / 2, angle + Math.PI / 2)
    path.closePath()
    path.moveTo(b.x + rB, b.y)
    path.arc(b.x, b.y, rB, 0, TAU)
  }
  return path
}

export function paintInkStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: InkPoint[][],
  size: number,
  color = INK_COLOR
): void {
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    if (stroke.length === 1) {
      dot(ctx, stroke[0], size)
      continue
    }
    // Contorno preenchido inteiro (qualidade) + segmentos por cima (garantia).
    const path = strokePath(stroke, size)
    if (path) ctx.fill(path)
    for (let i = 1; i < stroke.length; i += 1) drawSegment(ctx, stroke[i - 1], stroke[i], size)
  }
}

/** Reconstrói traços a partir do fluxo plano sincronizado (m=1 inicia traço). */
export function strokesFromFlat(flat: StrokePointNormalized[]): InkPoint[][] {
  const result: InkPoint[][] = []
  let current: InkPoint[] | null = null
  for (const point of flat) {
    if (point.m === 1 || Math.abs(point.x) > 1.5 || Math.abs(point.y) > 1.5) {
      current = []
      result.push(current)
      continue
    }
    if (!current) {
      current = []
      result.push(current)
    }
    current.push({ x: point.x, y: point.y, p: 0.62 })
  }
  return result.filter((stroke) => stroke.length > 0)
}

/** Reconstrói o espaço normalizado (0..1) de um strokepoint com flag m. */
export function isStrokeMarker(point: StrokePointNormalized | undefined | null): boolean {
  if (!point) return false
  if (point.m === 1) return true
  return Math.abs(point.x) > 1.5 || Math.abs(point.y) > 1.5
}

export function clampInkValue(value: number, min: number, max: number): number {
  return clampInk(value, min, max)
}

export const SIGNATURE_INK_COLOR = INK_COLOR

/**
 * Renderiza a assinatura (espaço normalizado) em PNG com FUNDO TRANSPARENTE,
 * recortada na área da tinta com margem — pronto para vale/recibo/PDF sem
 * cobrir o texto do recibo com um quadrado branco.
 */
export function signatureDataUrlFromNormalized(
  normalized: InkPoint[][],
  aspect: number,
  renderWidth?: number
): string {
  // Renderizar na MESMA largura de pixels que a tela de origem usou mantém a
  // geometria idêntica (espessura e variação por velocidade) — o que o PC
  // mostra é exatamente o que a pessoa desenhou no celular.
  const width = Math.round(clampInk(renderWidth || 1000, 600, 2600))
  const height = Math.round(width / clampInk(aspect || 0.5, 0.3, 4))
  const scaled: InkPoint[][] = normalized.map((stroke) =>
    stroke.map((point) => ({ x: point.x * width, y: point.y * height, p: point.p }))
  )
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of scaled) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }
  if (!Number.isFinite(minX) || maxX - minX < 4 || maxY - minY < 4) {
    throw new Error('Assinatura vazia.')
  }
  const pad = Math.max(20, Math.max(maxX - minX, maxY - minY) * 0.07)
  const x0 = Math.max(0, minX - pad)
  const y0 = Math.max(0, minY - pad)
  const boxW = Math.max(4, Math.min(width - x0, maxX - minX + pad * 2))
  const boxH = Math.max(4, Math.min(height - y0, maxY - minY + pad * 2))
  // Saída com no máximo ~1000px de largura: nítida no PDF e leve no banco.
  const outW = Math.round(clampInk(boxW, 240, 1000))
  const outH = Math.max(1, Math.round((outW * boxH) / boxW))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível renderizar a assinatura.')
  // SEM fill de fundo: PNG transparente.
  ctx.scale(outW / boxW, outH / boxH)
  ctx.translate(-x0, -y0)
  paintInkStrokes(ctx, scaled, 6.5)
  return canvas.toDataURL('image/png')
}
