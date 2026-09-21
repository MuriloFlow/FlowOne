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
    if (!source.startsWith('data:')) image.crossOrigin = 'anonymous'
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
  ctx.lineWidth = 1.75
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + Math.max(0, width), y)
  ctx.stroke()
}

const FONT = 'Inter, Segoe UI, Arial, sans-serif'

async function receiptImage(row: VoucherRow, number: string, signatureDataUrl: string): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = RECEIPT_W
  canvas.height = RECEIPT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível montar o recibo.')
  ensureRoundRect(ctx)

  const valueLabel = formatBRLFromCents(row.dayTotalCents)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, RECEIPT_W, RECEIPT_H)

  // Título acima da moldura (estilo boleto)
  ctx.fillStyle = '#A3A3A3'
  ctx.font = `600 22px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('RECIBO DE PAGAMENTO', 48, 36)

  const padX = 42
  const boxX = padX
  const boxY = 52
  const boxW = RECEIPT_W - padX * 2
  const boxH = RECEIPT_H - boxY - 36

  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 6
  ctx.roundRect(boxX, boxY, boxW, boxH, 22)
  ctx.stroke()

  // Cabeçalho interno em 3 colunas medidas
  const headX = boxX + 28
  const headY = boxY + 26
  const headW = boxW - 56
  const headH = 108
  ctx.lineWidth = 3.5
  ctx.roundRect(headX, headY, headW, headH, 16)
  ctx.stroke()

  const headPad = 28
  const headLeft = headX + headPad
  const headRight = headX + headW - headPad
  const headMidY = headY + headH / 2 + 16

  // VALOR à direita (reserva largura primeiro)
  ctx.fillStyle = '#111111'
  ctx.font = `700 30px ${FONT}`
  const valorText = `VALOR  ${valueLabel}`
  const valorW = ctx.measureText(valorText).width
  ctx.fillText(valorText, headRight - valorW, headMidY)

  // RECIBO à esquerda
  ctx.font = `900 58px ${FONT}`
  ctx.fillText('RECIBO', headLeft, headMidY)
  const reciboW = ctx.measureText('RECIBO').width

  // Nº no meio, com gap seguro dos dois lados
  const gap = 36
  const numLeft = headLeft + reciboW + gap
  const numRight = headRight - valorW - gap
  const numMaxW = Math.max(60, numRight - numLeft)
  let numSize = 28
  ctx.font = `700 ${numSize}px ${FONT}`
  const numLabel = `Nº ${number}`
  while (numSize > 18 && ctx.measureText(numLabel).width > numMaxW) {
    numSize -= 1
    ctx.font = `700 ${numSize}px ${FONT}`
  }
  const numW = Math.min(ctx.measureText(numLabel).width, numMaxW)
  fitText(ctx, numLabel, numLeft + (numMaxW - numW) / 2, headMidY, numMaxW, 'left')

  // Corpo
  let y = headY + headH + 56
  const contentLeft = boxX + 44
  const contentRight = boxX + boxW - 44
  const contentW = contentRight - contentLeft
  const rowGap = 64

  ctx.fillStyle = '#222222'
  ctx.font = `500 28px ${FONT}`
  const recebiLabel = 'Recebi (emos) de'
  ctx.fillText(recebiLabel, contentLeft, y)
  const recebiW = ctx.measureText(`${recebiLabel} `).width
  ctx.fillStyle = '#111111'
  ctx.font = `700 28px ${FONT}`
  fitText(ctx, 'FLOW — Central de Gestão e Operações', contentLeft + recebiW, y, contentW - recebiW - 4)
  drawUnderline(ctx, contentLeft + recebiW, y + 14, contentW - recebiW)
  y += rowGap

  ctx.fillStyle = '#222222'
  ctx.font = `500 28px ${FONT}`
  const quantiaLabel = 'a quantia de'
  ctx.fillText(quantiaLabel, contentLeft, y)
  const quantiaW = ctx.measureText(`${quantiaLabel} `).width
  ctx.fillStyle = '#111111'
  ctx.font = `800 32px ${FONT}`
  ctx.fillText(valueLabel, contentLeft + quantiaW, y)
  drawUnderline(ctx, contentLeft + quantiaW, y + 14, Math.max(260, ctx.measureText(valueLabel).width + 36))
  y += rowGap

  ctx.fillStyle = '#222222'
  ctx.font = `500 27px ${FONT}`
  const refLabel = 'Referente a'
  ctx.fillText(refLabel, contentLeft, y)
  const refW = ctx.measureText(`${refLabel} `).width
  ctx.font = `600 27px ${FONT}`
  fitText(ctx, 'vale-alimentação e vale-transporte.', contentLeft + refW, y, contentW - refW - 4)
  drawUnderline(ctx, contentLeft + refW, y + 14, contentW - refW)
  y += rowGap

  ctx.font = `500 27px ${FONT}`
  ctx.fillText('E para clareza firmo (amos) o presente.', contentLeft, y)
  y += 52

  const date = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date())
  ctx.font = `500 24px ${FONT}`
  ctx.fillStyle = '#333333'
  ctx.fillText(`São Paulo, ${date}.`, contentLeft, y)
  drawUnderline(ctx, contentLeft, y + 14, contentW)
  y += 78

  // Assinatura — faixa alta, assinatura um pouco maior, sem tocar Emitente
  const sigLabelY = y
  const sigLineY = y + 122
  ctx.fillStyle = '#222222'
  ctx.font = `600 27px ${FONT}`
  ctx.fillText('Assinatura', contentLeft, sigLabelY)

  const sigLineStart = contentLeft + 186
  const sigLineWidth = contentRight - sigLineStart
  drawUnderline(ctx, sigLineStart, sigLineY, sigLineWidth)

  try {
    const signature = await loadImage(signatureDataUrl)
    const maxSigW = sigLineWidth * 0.92
    const maxSigH = 136
    const scale = Math.min(maxSigW / Math.max(1, signature.width), maxSigH / Math.max(1, signature.height))
    const sigW = signature.width * scale
    const sigH = signature.height * scale
    const sigX = sigLineStart + (sigLineWidth - sigW) / 2
    const sigY = Math.max(sigLabelY + 10, sigLineY - sigH + 6)
    ctx.drawImage(signature, sigX, sigY, sigW, sigH)
  } catch {
    /* ok */
  }

  y = sigLineY + 56

  ctx.fillStyle = '#222222'
  ctx.font = `600 27px ${FONT}`
  ctx.fillText('Emitente', contentLeft, y)
  const emitenteW = ctx.measureText('Emitente').width
  const emitenteX = contentLeft + emitenteW + 26
  ctx.fillStyle = '#111111'
  ctx.font = `700 27px ${FONT}`
  fitText(ctx, 'FLOW — Central de Gestão e Operações', emitenteX, y, contentRight - emitenteX)
  drawUnderline(ctx, emitenteX, y + 14, contentRight - emitenteX)
  y += 54

  ctx.fillStyle = '#333333'
  ctx.font = `600 23px ${FONT}`
  ctx.fillText(`CPF ${row.cpf ? formatCpf(row.cpf) : 'não informado'}`, contentLeft, y)
  fitText(ctx, 'RG conforme documento anexo', contentRight, y, 520, 'right')

  return canvas.toDataURL('image/png')
}

function drawTitle(pdf: jsPDF, row: VoucherRow): void {
  pdf.setFillColor(17, 17, 17)
  pdf.rect(0, 0, PAGE_W, 28, 'F')
  pdf.setTextColor(245, 245, 242)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text('COMPROVANTE DE PAGAMENTO', 14, 11)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.text(row.name.toUpperCase(), 14, 18)
  pdf.text(
    `CPF: ${row.cpf ? formatCpf(row.cpf) : 'não informado'}     VALOR: ${formatBRLFromCents(row.dayTotalCents)}`,
    14,
    24
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
    const rgH = Math.min(72, 140 / rgRatio)
    const rgW = rgH * rgRatio
    const rgX = (PAGE_W - rgW) / 2

    pdf.setFontSize(8.5)
    pdf.setTextColor(90, 90, 90)
    pdf.text('RG — DOCUMENTO DE IDENTIDADE', 14, 36)
    pdf.addImage(rgData, 'JPEG', rgX, 39, rgW, rgH, undefined, 'FAST')

    const receiptY = 39 + rgH + 6
    const receiptW = 182
    const receiptH = (receiptW * RECEIPT_H) / RECEIPT_W
    pdf.addImage(receiptData, 'PNG', 14, receiptY, receiptW, receiptH, undefined, 'FAST')
  }

  const blob = pdf.output('blob')
  const stamp = new Date().toISOString().slice(0, 10)
  await exportFile(blob, `recibos-pagamentos-${stamp}.pdf`, 'Finalizar pagamento')
}
