import { jsPDF } from 'jspdf'
import type { VoucherRow } from '../../../shared/vouchers'
import { formatBRLFromCents } from '@/lib/format'
import { formatCpf } from '../../../shared/cpf'
import { exportFile } from '@/lib/native-export'
import { isMobileShell } from '@/lib/is-mobile-shell'

const PAGE_W = 210
const RECEIPT_W = 1600
const RECEIPT_H = 980

function ensureRoundRect(
  ctx: CanvasRenderingContext2D
): asserts ctx is CanvasRenderingContext2D & {
  roundRect: (x: number, y: number, w: number, h: number, r: number) => void
} {
  if (typeof ctx.roundRect === 'function') return
  ;(ctx as CanvasRenderingContext2D & { roundRect: typeof ctx.roundRect }).roundRect = function (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    const radius = Math.min(r, w / 2, h / 2)
    this.beginPath()
    this.moveTo(x + radius, y)
    this.arcTo(x + w, y, x + w, y + h, radius)
    this.arcTo(x + w, y + h, x, y + h, radius)
    this.arcTo(x, y + h, x, y, radius)
    this.arcTo(x, y, x + w, y, radius)
    this.closePath()
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (!source.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }
    const timer = window.setTimeout(() => reject(new Error('Tempo esgotado ao carregar uma imagem do recibo.')), 25_000)
    image.onload = () => {
      window.clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('Não foi possível preparar uma imagem do recibo.'))
    }
    image.src = source
  })
}

async function compressedJpeg(source: string, maxEdge = 1400, quality = 0.82): Promise<string> {
  const image = await loadImage(source)
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  align: CanvasTextAlign = 'left'
): void {
  ctx.save()
  ctx.textAlign = align
  let content = text
  if (ctx.measureText(content).width > maxWidth) {
    while (content.length > 1 && ctx.measureText(`${content}…`).width > maxWidth) {
      content = content.slice(0, -1)
    }
    content = `${content}…`
  }
  ctx.fillText(content, x, y)
  ctx.restore()
}

function drawUnderline(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
  ctx.strokeStyle = '#9A9A9A'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + width, y)
  ctx.stroke()
}

async function receiptImage(row: VoucherRow, number: string, signatureDataUrl: string): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = RECEIPT_W
  canvas.height = RECEIPT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível montar o recibo.')
  ensureRoundRect(ctx)

  const pad = 48
  const innerX = pad
  const innerY = pad
  const innerW = RECEIPT_W - pad * 2
  const innerH = RECEIPT_H - pad * 2

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, RECEIPT_W, RECEIPT_H)

  ctx.strokeStyle = '#171717'
  ctx.lineWidth = 6
  ctx.roundRect(innerX, innerY, innerW, innerH, 24)
  ctx.stroke()

  // Header band
  const headerY = innerY + 28
  const headerH = 108
  ctx.lineWidth = 3.5
  ctx.roundRect(innerX + 28, headerY, innerW - 56, headerH, 18)
  ctx.stroke()

  const headerPad = innerX + 52
  const headerMidY = headerY + headerH / 2 + 8
  const valueLabel = formatBRLFromCents(row.dayTotalCents)
  const rightBlockX = innerX + innerW - 52

  ctx.fillStyle = '#111111'
  ctx.font = '900 56px Arial, sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('RECIBO', headerPad, headerMidY)

  ctx.fillStyle = '#666666'
  ctx.font = '600 17px Arial, sans-serif'
  fitText(ctx, 'Nº', rightBlockX, headerY + 34, 500, 'right')
  ctx.fillStyle = '#111111'
  ctx.font = '700 24px Arial, sans-serif'
  fitText(ctx, number, rightBlockX, headerY + 62, 500, 'right')
  ctx.font = '800 28px Arial, sans-serif'
  fitText(ctx, `VALOR  ${valueLabel}`, rightBlockX, headerY + 96, 500, 'right')

  let y = headerY + headerH + 56
  const contentLeft = innerX + 44
  const contentRight = innerX + innerW - 44
  const contentW = contentRight - contentLeft

  // Line: Recebi de
  ctx.fillStyle = '#333333'
  ctx.font = '500 28px Arial, sans-serif'
  ctx.fillText('Recebi (emos) de', contentLeft, y)
  const recebiW = ctx.measureText('Recebi (emos) de ').width
  ctx.fillStyle = '#111111'
  ctx.font = '700 28px Arial, sans-serif'
  fitText(ctx, 'FLOW — Central de Gestão e Operações', contentLeft + recebiW, y, contentW - recebiW - 8)
  drawUnderline(ctx, contentLeft + recebiW, y + 10, contentW - recebiW)
  y += 64

  // Line: quantia
  ctx.fillStyle = '#333333'
  ctx.font = '500 28px Arial, sans-serif'
  ctx.fillText('a quantia de', contentLeft, y)
  const quantiaW = ctx.measureText('a quantia de ').width
  ctx.fillStyle = '#111111'
  ctx.font = '800 34px Arial, sans-serif'
  ctx.fillText(valueLabel, contentLeft + quantiaW, y)
  drawUnderline(ctx, contentLeft + quantiaW, y + 10, Math.max(220, ctx.measureText(valueLabel).width + 24))
  y += 64

  // Referente
  ctx.fillStyle = '#333333'
  ctx.font = '500 27px Arial, sans-serif'
  ctx.fillText('Referente a vale-alimentação e vale-transporte.', contentLeft, y)
  drawUnderline(ctx, contentLeft, y + 12, contentW)
  y += 58

  ctx.fillText('E para clareza firmo (amos) o presente.', contentLeft, y)
  y += 52

  const date = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date())
  ctx.font = '500 24px Arial, sans-serif'
  ctx.fillStyle = '#444444'
  ctx.fillText(`São Paulo, ${date}.`, contentLeft, y)
  drawUnderline(ctx, contentLeft, y + 12, contentW)
  y += 70

  // Signature block — reserved band so ink never hits Emitente
  const sigBandTop = y
  const sigBandH = 168
  const sigLabelY = sigBandTop + 28
  const sigLineY = sigBandTop + 118

  ctx.fillStyle = '#333333'
  ctx.font = '600 26px Arial, sans-serif'
  ctx.fillText('Assinatura', contentLeft, sigLabelY)

  const sigLineStart = contentLeft + 180
  const sigLineWidth = contentRight - sigLineStart
  drawUnderline(ctx, sigLineStart, sigLineY, sigLineWidth)

  try {
    const signature = await loadImage(signatureDataUrl)
    const maxSigW = sigLineWidth * 0.72
    const maxSigH = 88
    const scale = Math.min(maxSigW / signature.width, maxSigH / signature.height, 1)
    const sigW = signature.width * scale
    const sigH = signature.height * scale
    const sigX = sigLineStart + (sigLineWidth - sigW) / 2
    const sigY = sigLineY - sigH + 6
    ctx.drawImage(signature, sigX, sigY, sigW, sigH)
  } catch {
    /* assinatura opcional na imagem — PDF já valida existência */
  }

  y = sigBandTop + sigBandH + 8

  // Emitente
  ctx.fillStyle = '#333333'
  ctx.font = '600 26px Arial, sans-serif'
  ctx.fillText('Emitente', contentLeft, y)
  const emitenteLabelW = ctx.measureText('Emitente').width
  const emitenteValueX = contentLeft + emitenteLabelW + 28
  ctx.fillStyle = '#111111'
  ctx.font = '700 26px Arial, sans-serif'
  fitText(ctx, 'FLOW — Central de Gestão e Operações', emitenteValueX, y, contentRight - emitenteValueX)
  drawUnderline(ctx, emitenteValueX, y + 10, contentRight - emitenteValueX)
  y += 52

  // Footer docs
  ctx.fillStyle = '#444444'
  ctx.font = '600 24px Arial, sans-serif'
  ctx.fillText(`CPF ${row.cpf ? formatCpf(row.cpf) : 'não informado'}`, contentLeft, y)
  fitText(ctx, 'RG conforme documento anexo', contentRight, y, 520, 'right')

  return canvas.toDataURL('image/png')
}

function drawTitle(pdf: jsPDF, row: VoucherRow): void {
  pdf.setFillColor(17, 17, 17)
  pdf.rect(0, 0, PAGE_W, 31, 'F')
  pdf.setTextColor(245, 245, 242)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.text('COMPROVANTE DE PAGAMENTO', 14, 13)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(row.name.toUpperCase(), 14, 21)
  pdf.text(
    `CPF: ${row.cpf ? formatCpf(row.cpf) : 'não informado'}     VALOR: ${formatBRLFromCents(row.dayTotalCents)}`,
    14,
    27
  )
  pdf.setTextColor(25, 25, 25)
}

export async function exportVoucherReceipts(rows: VoucherRow[]): Promise<void> {
  const signed = rows.filter((row) => row.status === 'PAGO' && row.paymentSignature)
  if (!signed.length) throw new Error('Não há pagamentos assinados para finalizar.')
  const missing = signed.find((row) => !row.rgImage || !row.cpf)
  if (missing) throw new Error(`${missing.name} precisa ter CPF e foto do RG para gerar o recibo.`)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  for (const [index, row] of signed.entries()) {
    if (index) pdf.addPage()
    drawTitle(pdf, row)

    const rgData = await compressedJpeg(row.rgImage!, isMobileShell() ? 1200 : 1600, 0.8)
    const rg = await loadImage(rgData)
    const receiptData = await receiptImage(
      row,
      row.receiptNumber ?? String(index + 1).padStart(5, '0'),
      row.paymentSignature!
    )

    const rgRatio = rg.width / Math.max(1, rg.height)
    const rgH = Math.min(88, 150 / rgRatio)
    const rgW = rgH * rgRatio
    const rgX = (PAGE_W - rgW) / 2

    pdf.setFontSize(9)
    pdf.setTextColor(75, 75, 75)
    pdf.text('RG — DOCUMENTO DE IDENTIDADE', 14, 39)
    pdf.addImage(rgData, 'JPEG', rgX, 43, rgW, rgH, undefined, 'FAST')

    const receiptY = 43 + rgH + 10
    const receiptH = Math.min(118, 280 - receiptY)
    pdf.setFontSize(9)
    pdf.text('RECIBO DE PAGAMENTO', 14, receiptY - 3)
    // Assinatura já está dentro do canvas — sem overlay que invade Emitente
    pdf.addImage(receiptData, 'PNG', 14, receiptY, 182, receiptH, undefined, 'FAST')
  }

  const blob = pdf.output('blob')
  const stamp = new Date().toISOString().slice(0, 10)
  await exportFile(blob, `recibos-pagamentos-${stamp}.pdf`, 'Finalizar pagamento')
}
