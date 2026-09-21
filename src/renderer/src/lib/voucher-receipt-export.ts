import { jsPDF } from 'jspdf'
import type { VoucherRow } from '../../../shared/vouchers'
import { formatBRLFromCents } from '@/lib/format'
import { formatCpf } from '../../../shared/cpf'
import { exportFile } from '@/lib/native-export'
import { isMobileShell } from '@/lib/is-mobile-shell'

const PAGE_W = 210
const RECEIPT_W = 1600
const RECEIPT_H = 920

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
  ctx.strokeStyle = '#888888'
  ctx.lineWidth = 2
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

  const pad = 42
  const boxX = pad
  const boxY = pad
  const boxW = RECEIPT_W - pad * 2
  const boxH = RECEIPT_H - pad * 2
  const valueLabel = formatBRLFromCents(row.dayTotalCents)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, RECEIPT_W, RECEIPT_H)

  // Moldura externa — estilo boleto
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 7
  ctx.roundRect(boxX, boxY, boxW, boxH, 26)
  ctx.stroke()

  // Cabeçalho interno
  const headX = boxX + 32
  const headY = boxY + 28
  const headW = boxW - 64
  const headH = 112
  ctx.lineWidth = 4
  ctx.roundRect(headX, headY, headW, headH, 20)
  ctx.stroke()

  const headPad = 36
  const headLeft = headX + headPad
  const headRight = headX + headW - headPad
  const headBaseline = headY + headH / 2 + 18

  // RECIBO (esquerda)
  ctx.fillStyle = '#111111'
  ctx.font = `900 62px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('RECIBO', headLeft, headBaseline)
  const reciboW = ctx.measureText('RECIBO').width

  // VALOR (direita) — medido primeiro para reservar espaço
  ctx.font = `700 28px ${FONT}`
  const valorText = `VALOR  ${valueLabel}`
  const valorW = ctx.measureText(valorText).width
  ctx.fillText(valorText, headRight - valorW, headBaseline)

  // Nº no centro, entre RECIBO e VALOR, sem colidir
  const numLeft = headLeft + reciboW + 40
  const numRight = headRight - valorW - 40
  const numMaxW = Math.max(80, numRight - numLeft)
  ctx.font = `700 30px ${FONT}`
  const numLabel = `Nº ${number}`
  const numW = Math.min(ctx.measureText(numLabel).width, numMaxW)
  const numX = numLeft + (numMaxW - numW) / 2
  fitText(ctx, numLabel, numX, headBaseline, numMaxW, 'left')

  // Corpo
  let y = headY + headH + 58
  const contentLeft = boxX + 48
  const contentRight = boxX + boxW - 48
  const contentW = contentRight - contentLeft

  const rowGap = 62

  // Recebi (emos) de ________
  ctx.fillStyle = '#222222'
  ctx.font = `500 29px ${FONT}`
  const recebiLabel = 'Recebi (emos) de'
  ctx.fillText(recebiLabel, contentLeft, y)
  const recebiW = ctx.measureText(`${recebiLabel} `).width
  ctx.fillStyle = '#111111'
  ctx.font = `700 29px ${FONT}`
  fitText(ctx, 'FLOW — Central de Gestão e Operações', contentLeft + recebiW, y, contentW - recebiW - 4)
  drawUnderline(ctx, contentLeft + recebiW, y + 12, contentW - recebiW)
  y += rowGap

  // a quantia de ________
  ctx.fillStyle = '#222222'
  ctx.font = `500 29px ${FONT}`
  const quantiaLabel = 'a quantia de'
  ctx.fillText(quantiaLabel, contentLeft, y)
  const quantiaW = ctx.measureText(`${quantiaLabel} `).width
  ctx.fillStyle = '#111111'
  ctx.font = `800 34px ${FONT}`
  ctx.fillText(valueLabel, contentLeft + quantiaW, y)
  drawUnderline(ctx, contentLeft + quantiaW, y + 12, Math.max(240, ctx.measureText(valueLabel).width + 28))
  y += rowGap

  // Referente a ________
  ctx.fillStyle = '#222222'
  ctx.font = `500 28px ${FONT}`
  const refLabel = 'Referente a'
  ctx.fillText(refLabel, contentLeft, y)
  const refW = ctx.measureText(`${refLabel} `).width
  ctx.font = `600 28px ${FONT}`
  fitText(ctx, 'vale-alimentação e vale-transporte.', contentLeft + refW, y, contentW - refW - 4)
  drawUnderline(ctx, contentLeft + refW, y + 12, contentW - refW)
  y += rowGap

  ctx.font = `500 28px ${FONT}`
  ctx.fillText('E para clareza firmo (amos) o presente.', contentLeft, y)
  y += 54

  const date = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date())
  ctx.font = `500 25px ${FONT}`
  ctx.fillStyle = '#333333'
  ctx.fillText(`São Paulo, ${date}.`, contentLeft, y)
  drawUnderline(ctx, contentLeft, y + 12, contentW)
  y += 72

  // Assinatura — faixa alta + assinatura um pouco maior
  const sigLabelY = y
  const sigLineY = y + 108
  ctx.fillStyle = '#222222'
  ctx.font = `600 28px ${FONT}`
  ctx.fillText('Assinatura', contentLeft, sigLabelY)

  const sigLineStart = contentLeft + 190
  const sigLineWidth = contentRight - sigLineStart
  drawUnderline(ctx, sigLineStart, sigLineY, sigLineWidth)

  try {
    const signature = await loadImage(signatureDataUrl)
    const maxSigW = sigLineWidth * 0.88
    const maxSigH = 118
    const scale = Math.min(maxSigW / Math.max(1, signature.width), maxSigH / Math.max(1, signature.height))
    const sigW = signature.width * scale
    const sigH = signature.height * scale
    const sigX = sigLineStart + (sigLineWidth - sigW) / 2
    // Apoia a base da assinatura na linha, sem descer no Emitente
    const sigY = sigLineY - sigH + 4
    ctx.drawImage(signature, sigX, Math.max(sigLabelY + 8, sigY), sigW, sigH)
  } catch {
    /* ok */
  }

  y = sigLineY + 48

  // Emitente
  ctx.fillStyle = '#222222'
  ctx.font = `600 28px ${FONT}`
  ctx.fillText('Emitente', contentLeft, y)
  const emitenteW = ctx.measureText('Emitente').width
  const emitenteX = contentLeft + emitenteW + 28
  ctx.fillStyle = '#111111'
  ctx.font = `700 28px ${FONT}`
  fitText(ctx, 'FLOW — Central de Gestão e Operações', emitenteX, y, contentRight - emitenteX)
  drawUnderline(ctx, emitenteX, y + 12, contentRight - emitenteX)
  y += 52

  ctx.fillStyle = '#333333'
  ctx.font = `600 24px ${FONT}`
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
    const rgH = Math.min(78, 140 / rgRatio)
    const rgW = rgH * rgRatio
    const rgX = (PAGE_W - rgW) / 2

    pdf.setFontSize(8.5)
    pdf.setTextColor(90, 90, 90)
    pdf.text('RG — DOCUMENTO DE IDENTIDADE', 14, 36)
    pdf.addImage(rgData, 'JPEG', rgX, 39, rgW, rgH, undefined, 'FAST')

    const receiptY = 39 + rgH + 9
    // Mantém proporção do canvas (1600x920) → altura ~104mm em 182mm de largura
    const receiptW = 182
    const receiptH = (receiptW * RECEIPT_H) / RECEIPT_W
    pdf.setFontSize(8.5)
    pdf.text('RECIBO DE PAGAMENTO', 14, receiptY - 3)
    pdf.addImage(receiptData, 'PNG', 14, receiptY, receiptW, receiptH, undefined, 'FAST')
  }

  const blob = pdf.output('blob')
  const stamp = new Date().toISOString().slice(0, 10)
  await exportFile(blob, `recibos-pagamentos-${stamp}.pdf`, 'Finalizar pagamento')
}
