import { jsPDF } from 'jspdf'
import type { VoucherRow } from '../../../shared/vouchers'
import { formatBRLFromCents } from '@/lib/format'
import { formatCpf } from '../../../shared/cpf'
import { exportFile } from '@/lib/native-export'
import { isMobileShell } from '@/lib/is-mobile-shell'

const PAGE_W = 210
const RECEIPT_W = 1600
const RECEIPT_H = 980

const INK = '#1A1A1A'
const BAR_GRAY = '#D9D9D9'
const FONT = 'Inter, Segoe UI, Arial, sans-serif'

// Pagador fixo do recibo (emitente dos vales).
const PAYER_NAME = 'Nng Comercio de Calcados LTDA.'
const PURPOSE_TEXT = 'vale-alimentação e vale-transporte de domingo'
const DEFAULT_CITY = 'São Paulo'

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

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ensureRoundRect(ctx)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.stroke()
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ensureRoundRect(ctx)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
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
  ctx.strokeStyle = '#4D4D4D'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + Math.max(0, width), y)
  ctx.stroke()
}

/* ------------------------------------------------------------------ */
/* Valor por extenso (pt-BR)                                           */
/* ------------------------------------------------------------------ */

const UNITS = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'
]
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const HUNDREDS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'
]

function wordsBelow100(n: number): string {
  if (n < 20) return UNITS[n]
  const d = Math.floor(n / 10)
  const u = n % 10
  return u ? `${TENS[d]} e ${UNITS[u]}` : TENS[d]
}

function wordsBelow1000(n: number): string {
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (c) parts.push(HUNDREDS[c])
  if (rest) parts.push(wordsBelow100(rest))
  return parts.join(' e ')
}

function integerWords(n: number): string {
  if (n < 1000) return wordsBelow1000(n)
  if (n < 1_000_000) {
    const mil = Math.floor(n / 1000)
    const rest = n % 1000
    const head = mil === 1 ? 'mil' : `${wordsBelow1000(mil)} mil`
    if (!rest) return head
    const connector = rest < 100 || rest % 100 === 0 ? ' e ' : ' '
    return `${head}${connector}${wordsBelow1000(rest)}`
  }
  const mi = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  const head = mi === 1 ? 'um milhão' : `${wordsBelow1000(mi)} milhões`
  if (!rest) return head
  return `${head} e ${integerWords(rest)}`
}

function valorPorExtenso(cents: number): string {
  const safe = Math.max(0, Math.round(cents))
  const reais = Math.floor(safe / 100)
  const centavos = safe % 100
  const parts: string[] = []
  if (reais || !centavos) parts.push(`${integerWords(reais)} ${reais === 1 ? 'real' : 'reais'}`)
  if (centavos) parts.push(`${integerWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  return parts.join(' e ')
}

/* ------------------------------------------------------------------ */
/* Recibo — réplica visual do modelo "São Domingos" (moldura dupla,    */
/* cabeçalho RECIBO / Nº / VALOR, barras cinza e campos preenchidos)   */
/* ------------------------------------------------------------------ */

async function receiptImage(row: VoucherRow, number: string, signatureDataUrl: string): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = RECEIPT_W
  canvas.height = RECEIPT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível montar o recibo.')
  ensureRoundRect(ctx)
  ctx.textBaseline = 'alphabetic'

  const valueLabel = formatBRLFromCents(row.dayTotalCents)
  const valueWords = valorPorExtenso(row.dayTotalCents)
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(now)
  const year = String(now.getFullYear())

  // Fundo
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, RECEIPT_W, RECEIPT_H)

  // Moldura externa dupla (arredondada)
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 6
  strokeRoundRect(ctx, 40, 22, 1520, 918, 26)

  // Caixa de cabeçalho
  const headX = 72
  const headY = 58
  const headW = 1456
  const headH = 170
  const headRight = headX + headW - 26
  ctx.lineWidth = 5
  strokeRoundRect(ctx, headX, headY, headW, headH, 20)

  const headMid = headY + headH / 2
  const barY = headMid - 30
  const barH = 60

  // RECIBO (título forte)
  ctx.fillStyle = '#0D0D0D'
  ctx.textAlign = 'left'
  ctx.font = `900 92px ${FONT}`
  ctx.fillText('RECIBO', 114, headMid + 33)
  const reciboEnd = 114 + ctx.measureText('RECIBO').width

  // Nº + barra cinza preenchida com o número
  ctx.font = `700 46px ${FONT}`
  const numLabelX = reciboEnd + 64
  ctx.fillText('Nº', numLabelX, headMid + 16)
  const numBarX = numLabelX + ctx.measureText('Nº').width + 20
  const numBarW = 286
  ctx.fillStyle = BAR_GRAY
  fillRoundRect(ctx, numBarX, barY, numBarW, barH, 8)
  ctx.fillStyle = '#111111'
  ctx.font = `700 34px ${FONT}`
  ctx.textAlign = 'center'
  fitText(ctx, number, numBarX + numBarW / 2, headMid + 13, numBarW - 20, 'center')

  // VALOR + barra cinza preenchida com o valor
  ctx.textAlign = 'left'
  ctx.fillStyle = '#0D0D0D'
  ctx.font = `700 46px ${FONT}`
  const valorLabelX = numBarX + numBarW + 64
  ctx.fillText('VALOR', valorLabelX, headMid + 16)
  const valorBarX = valorLabelX + ctx.measureText('VALOR').width + 20
  const valorBarW = headRight - valorBarX
  ctx.fillStyle = BAR_GRAY
  fillRoundRect(ctx, valorBarX, barY, valorBarW, barH, 8)
  ctx.fillStyle = '#111111'
  ctx.font = `800 38px ${FONT}`
  fitText(ctx, valueLabel, valorBarX + valorBarW / 2, headMid + 14, valorBarW - 24, 'center')

  // Corpo
  const left = 92
  const right = 1508

  // Recebi (emos) de ______
  let y = 300
  ctx.textAlign = 'left'
  ctx.fillStyle = INK
  ctx.font = `500 36px ${FONT}`
  const recebiLabel = 'Recebi (emos) de '
  ctx.fillText(recebiLabel, left, y)
  const recebiX = left + ctx.measureText(recebiLabel).width
  ctx.font = `700 36px ${FONT}`
  fitText(ctx, PAYER_NAME, recebiX, y, right - recebiX - 8)
  drawUnderline(ctx, recebiX, y + 12, right - recebiX)

  // a quantia de [barra com o valor]
  y = 378
  ctx.textAlign = 'left'
  ctx.fillStyle = INK
  ctx.font = `500 36px ${FONT}`
  const quantiaLabel = 'a quantia de '
  ctx.fillText(quantiaLabel, left, y)
  const quantiaX = left + ctx.measureText(quantiaLabel).width
  const bar1X = quantiaX + 14
  const bar1Y = y - 46
  const bar1H = 58
  ctx.fillStyle = BAR_GRAY
  fillRoundRect(ctx, bar1X, bar1Y, right - bar1X, bar1H, 8)
  ctx.fillStyle = '#111111'
  ctx.font = `800 38px ${FONT}`
  fitText(ctx, valueLabel, bar1X + 26, bar1Y + bar1H / 2 + 13, right - bar1X - 52)

  // Barra do valor por extenso
  const bar2Y = 454
  const bar2H = 58
  ctx.fillStyle = BAR_GRAY
  fillRoundRect(ctx, left, bar2Y, right - left, bar2H, 8)
  ctx.fillStyle = '#1F1F1F'
  let wordsSize = 32
  ctx.font = `600 ${wordsSize}px ${FONT}`
  while (wordsSize > 20 && ctx.measureText(valueWords).width > right - left - 56) {
    wordsSize -= 1
    ctx.font = `600 ${wordsSize}px ${FONT}`
  }
  fitText(ctx, valueWords, left + 28, bar2Y + bar2H / 2 + 11, right - left - 56)

  // Referente a ______
  y = 590
  ctx.textAlign = 'left'
  ctx.fillStyle = INK
  ctx.font = `500 36px ${FONT}`
  const refLabel = 'Referente a '
  ctx.fillText(refLabel, left, y)
  const refX = left + ctx.measureText(refLabel).width
  ctx.font = `700 36px ${FONT}`
  fitText(ctx, PURPOSE_TEXT, refX, y, right - refX - 8)
  drawUnderline(ctx, refX, y + 12, right - refX)

  // e para clareza firmo (amos) o presente.
  y = 668
  ctx.font = `500 36px ${FONT}`
  ctx.fillStyle = INK
  ctx.fillText('e para clareza firmo (amos) o presente.', left, y)

  // Data: cidade , dia de mês de ano
  const dateTextY = 742
  const dateLineY = 752
  const cityLineEnd = 640
  const dayLineX = 692
  const dayLineEnd = 814
  const de1X = 832
  const monthLineX = 902
  const monthLineEnd = 1202
  const de2X = 1220
  const yearLineX = 1288
  const yearLineEnd = 1420

  drawUnderline(ctx, left, dateLineY, cityLineEnd - left)
  ctx.fillStyle = '#111111'
  ctx.font = `600 34px ${FONT}`
  ctx.textAlign = 'left'
  fitText(ctx, DEFAULT_CITY, left + 16, dateTextY, cityLineEnd - left - 24)

  ctx.fillStyle = INK
  ctx.font = `500 34px ${FONT}`
  ctx.fillText(',', cityLineEnd + 16, dateTextY)

  drawUnderline(ctx, dayLineX, dateLineY, dayLineEnd - dayLineX)
  ctx.fillStyle = '#111111'
  ctx.textAlign = 'center'
  ctx.fillText(day, (dayLineX + dayLineEnd) / 2, dateTextY)

  ctx.textAlign = 'left'
  ctx.fillStyle = INK
  ctx.fillText('de', de1X, dateTextY)

  drawUnderline(ctx, monthLineX, dateLineY, monthLineEnd - monthLineX)
  ctx.fillStyle = '#111111'
  ctx.textAlign = 'center'
  fitText(ctx, month, (monthLineX + monthLineEnd) / 2, dateTextY, monthLineEnd - monthLineX - 16, 'center')

  ctx.textAlign = 'left'
  ctx.fillStyle = INK
  ctx.fillText('de', de2X, dateTextY)

  drawUnderline(ctx, yearLineX, dateLineY, yearLineEnd - yearLineX)
  ctx.fillStyle = '#111111'
  ctx.textAlign = 'center'
  ctx.fillText(year, (yearLineX + yearLineEnd) / 2, dateTextY)
  ctx.textAlign = 'left'

  // Assinatura do funcionário sobre a linha
  const sigLabelY = 846
  ctx.fillStyle = INK
  ctx.font = `500 36px ${FONT}`
  ctx.fillText('Assinatura', left, sigLabelY)
  const sigX = left + ctx.measureText('Assinatura').width + 28
  const sigLineY = 856
  const sigLineW = right - sigX
  drawUnderline(ctx, sigX, sigLineY, sigLineW)
  try {
    const signature = await loadImage(signatureDataUrl)
    const maxSigW = sigLineW * 0.9
    const maxSigH = 88
    const scale = Math.min(maxSigW / Math.max(1, signature.width), maxSigH / Math.max(1, signature.height))
    const sigW = signature.width * scale
    const sigH = signature.height * scale
    ctx.drawImage(signature, sigX + (sigLineW - sigW) / 2, sigLineY - sigH - 4, sigW, sigH)
  } catch {
    /* assinatura ausente — mantém só a linha */
  }

  // Nome (esquerda) + CPF/RG (direita)
  const footY = 922
  ctx.fillStyle = INK
  ctx.font = `500 34px ${FONT}`
  ctx.fillText('Nome', left, footY)
  const nomeX = left + ctx.measureText('Nome').width + 28
  const cpfLabelX = 940
  ctx.fillText('CPF / RG', cpfLabelX, footY)
  const cpfX = cpfLabelX + ctx.measureText('CPF / RG').width + 28
  drawUnderline(ctx, nomeX, footY + 10, cpfLabelX - 40 - nomeX)
  drawUnderline(ctx, cpfX, footY + 10, right - cpfX)

  ctx.fillStyle = '#111111'
  ctx.font = `700 32px ${FONT}`
  fitText(ctx, row.name, nomeX + 4, footY, cpfLabelX - 48 - nomeX)

  const cpfText = row.cpf ? formatCpf(row.cpf) : 'não informado'
  const rgMention = `${cpfText} · RG anexo`
  let footSize = 30
  ctx.font = `700 ${footSize}px ${FONT}`
  let footValue = rgMention
  while (footSize > 24 && ctx.measureText(footValue).width > 1470 - cpfX - 12) {
    footSize -= 1
    ctx.font = `700 ${footSize}px ${FONT}`
  }
  if (ctx.measureText(footValue).width > 1470 - cpfX - 12) footValue = cpfText
  fitText(ctx, footValue, cpfX + 4, footY, 1470 - cpfX - 12)

  // Marca no canto inferior direito (sobrepõe a moldura, como no modelo)
  ctx.fillStyle = '#141414'
  fillRoundRect(ctx, 1478, 908, 114, 56, 10)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 26px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('FLOW', 1478 + 57, 944)
  ctx.textAlign = 'left'

  return canvas.toDataURL('image/png')
}

/**
 * Monta o PDF dos recibos assinados sem abrir compartilhamento — usado pela
 * tela de sucesso no mobile (compartilhar ou baixar depois).
 */
export async function buildVoucherReceiptsPdf(rows: VoucherRow[]): Promise<{ blob: Blob; filename: string }> {
  const signed = rows.filter((row) => row.status === 'PAGO' && row.paymentSignature)
  if (!signed.length) throw new Error('Não há pagamentos assinados para finalizar.')
  const missing = signed.find((row) => !row.rgImage || !row.cpf)
  if (missing) throw new Error(`${missing.name} precisa ter CPF e foto do RG para gerar o recibo.`)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  for (const [index, row] of signed.entries()) {
    if (index) pdf.addPage()

    const rgData = await compressedJpeg(row.rgImage!, isMobileShell() ? 1200 : 1600, 0.8)
    const rg = await loadImage(rgData)
    const receiptData = await receiptImage(
      row,
      row.receiptNumber ?? String(index + 1).padStart(5, '0'),
      row.paymentSignature!
    )

    // Foto do RG no topo da página
    const rgRatio = rg.width / Math.max(1, rg.height)
    const rgH = Math.min(80, 150 / rgRatio)
    const rgW = rgH * rgRatio
    const rgX = (PAGE_W - rgW) / 2

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(120, 120, 120)
    pdf.text('RG — DOCUMENTO DE IDENTIDADE', PAGE_W / 2, 14, { align: 'center' })
    pdf.addImage(rgData, 'JPEG', rgX, 17, rgW, rgH, undefined, 'FAST')

    // Recibo abaixo, com sombra sutil de "foto sobre o papel"
    const receiptW = 188
    const receiptH = (receiptW * RECEIPT_H) / RECEIPT_W
    const receiptX = (PAGE_W - receiptW) / 2
    const receiptY = 17 + rgH + 10

    pdf.setFillColor(214, 214, 214)
    pdf.roundedRect(receiptX + 1.4, receiptY + 1.6, receiptW, receiptH, 2.5, 2.5, 'F')
    pdf.addImage(receiptData, 'PNG', receiptX, receiptY, receiptW, receiptH, undefined, 'FAST')
  }

  const blob = pdf.output('blob')
  const stamp = new Date().toISOString().slice(0, 10)
  return { blob, filename: `recibos-pagamentos-${stamp}.pdf` }
}

/**
 * Desktop: gera o PDF e dispara o download.
 * No mobile a página usa buildVoucherReceiptsPdf + ExportSuccessSheet para
 * abrir o compartilhamento nativo do celular ou salvar o arquivo.
 */
export async function exportVoucherReceipts(rows: VoucherRow[]): Promise<void> {
  const { blob, filename } = await buildVoucherReceiptsPdf(rows)
  await exportFile(blob, filename, 'Finalizar pagamento')
}
