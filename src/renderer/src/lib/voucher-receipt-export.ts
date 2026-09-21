import { jsPDF } from 'jspdf'
import type { VoucherRow } from '../../../shared/vouchers'
import { formatBRLFromCents } from '@/lib/format'
import { formatCpf } from '../../../shared/cpf'
import { exportFile } from '@/lib/native-export'
import { isMobileShell } from '@/lib/is-mobile-shell'

const PAGE_W = 210

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

/** Reduz foto do RG para caber no PDF sem estourar memória no mobile. */
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

function receiptImage(row: VoucherRow, number: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = isMobileShell() ? 1200 : 1600
  canvas.height = isMobileShell() ? 645 : 860
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível montar o recibo.')
  ensureRoundRect(ctx)
  const w = canvas.width
  const h = canvas.height
  const s = w / 1600
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#171717'
  ctx.lineWidth = 7 * s
  ctx.roundRect(14 * s, 14 * s, w - 28 * s, h - 28 * s, 28 * s)
  ctx.stroke()
  ctx.lineWidth = 4 * s
  ctx.roundRect(35 * s, 35 * s, w - 70 * s, 100 * s, 22 * s)
  ctx.stroke()
  ctx.font = `900 ${68 * s}px Arial, sans-serif`
  ctx.fillStyle = '#111'
  ctx.fillText('RECIBO', 64 * s, 105 * s)
  ctx.font = `700 ${36 * s}px Arial, sans-serif`
  ctx.fillText('Nº', 530 * s, 95 * s)
  ctx.fillText(number, 600 * s, 95 * s)
  ctx.fillText('VALOR', 940 * s, 95 * s)
  ctx.font = `700 ${42 * s}px Arial, sans-serif`
  ctx.fillText(formatBRLFromCents(row.dayTotalCents), 1120 * s, 95 * s)
  ctx.font = `500 ${32 * s}px Arial, sans-serif`
  ctx.fillText('Recebi (emos) de', 66 * s, 215 * s)
  ctx.font = `700 ${33 * s}px Arial, sans-serif`
  ctx.fillText('FLOW — Central de Gestão e Operações', 365 * s, 215 * s)
  ctx.strokeStyle = '#777'
  ctx.lineWidth = 2 * s
  ctx.beginPath()
  ctx.moveTo(360 * s, 225 * s)
  ctx.lineTo(1515 * s, 225 * s)
  ctx.stroke()
  ctx.font = `500 ${32 * s}px Arial, sans-serif`
  ctx.fillStyle = '#111'
  ctx.fillText('a quantia de', 66 * s, 290 * s)
  ctx.font = `700 ${40 * s}px Arial, sans-serif`
  ctx.fillText(formatBRLFromCents(row.dayTotalCents), 310 * s, 290 * s)
  ctx.font = `500 ${31 * s}px Arial, sans-serif`
  ctx.fillText('Referente a vale-alimentação e vale-transporte.', 66 * s, 390 * s)
  ctx.beginPath()
  ctx.moveTo(65 * s, 410 * s)
  ctx.lineTo(1515 * s, 410 * s)
  ctx.stroke()
  ctx.fillText('E para clareza firmo (amos) o presente.', 66 * s, 468 * s)
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())
  ctx.font = `500 ${27 * s}px Arial, sans-serif`
  ctx.fillText(`São Paulo, ${date}.`, 66 * s, 540 * s)
  ctx.beginPath()
  ctx.moveTo(65 * s, 562 * s)
  ctx.lineTo(1515 * s, 562 * s)
  ctx.stroke()
  ctx.font = `600 ${31 * s}px Arial, sans-serif`
  ctx.fillText('Assinatura', 66 * s, 650 * s)
  ctx.beginPath()
  ctx.moveTo(265 * s, 658 * s)
  ctx.lineTo(1515 * s, 658 * s)
  ctx.stroke()
  ctx.fillText('Emitente', 66 * s, 720 * s)
  ctx.font = `700 ${30 * s}px Arial, sans-serif`
  ctx.fillText('FLOW — Central de Gestão e Operações', 265 * s, 720 * s)
  ctx.beginPath()
  ctx.moveTo(265 * s, 728 * s)
  ctx.lineTo(1515 * s, 728 * s)
  ctx.stroke()
  ctx.font = `600 ${29 * s}px Arial, sans-serif`
  ctx.fillText(`CPF ${row.cpf ? formatCpf(row.cpf) : 'não informado'}`, 66 * s, 790 * s)
  ctx.fillText('RG conforme documento anexo', 770 * s, 790 * s)
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
    const receipt = await loadImage(receiptImage(row, row.receiptNumber ?? String(index + 1).padStart(5, '0')))
    const signature = await loadImage(row.paymentSignature!)

    const rgRatio = rg.width / Math.max(1, rg.height)
    const rgH = Math.min(105, 168 / rgRatio)
    const rgW = rgH * rgRatio
    const rgX = (PAGE_W - rgW) / 2

    pdf.setFontSize(9)
    pdf.setTextColor(75, 75, 75)
    pdf.text('RG — DOCUMENTO DE IDENTIDADE', 14, 39)
    pdf.addImage(rgData, 'JPEG', rgX, 43, rgW, rgH, undefined, 'FAST')

    const receiptY = 43 + rgH + 11
    pdf.setFontSize(9)
    pdf.text('RECIBO DE PAGAMENTO', 14, receiptY - 3)
    pdf.addImage(receipt, 'PNG', 14, receiptY, 182, 97, undefined, 'FAST')
    pdf.addImage(signature, 'PNG', 48, receiptY + 67, 145, 17, undefined, 'FAST')
  }

  const blob = pdf.output('blob')
  const stamp = new Date().toISOString().slice(0, 10)
  await exportFile(blob, `recibos-pagamentos-${stamp}.pdf`, 'Finalizar pagamento')
}
