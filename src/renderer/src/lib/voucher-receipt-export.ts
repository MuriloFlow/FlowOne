import { jsPDF } from 'jspdf'
import type { VoucherRow } from '../../../shared/vouchers'
import { formatBRLFromCents } from '@/lib/format'
import { formatCpf } from '../../../shared/cpf'
import { exportFile } from '@/lib/native-export'

const PAGE_W = 210

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível preparar uma imagem do recibo.'))
    image.src = source
  })
}

function receiptImage(row: VoucherRow, number: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 860
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#171717'
  ctx.lineWidth = 7
  ctx.roundRect(14, 14, w - 28, h - 28, 28)
  ctx.stroke()
  ctx.lineWidth = 4
  ctx.roundRect(35, 35, w - 70, 100, 22)
  ctx.stroke()
  ctx.font = '900 68px Arial, sans-serif'
  ctx.fillStyle = '#111'
  ctx.fillText('RECIBO', 64, 105)
  ctx.font = '700 36px Arial, sans-serif'
  ctx.fillText('Nº', 530, 95)
  ctx.fillText(number, 600, 95)
  ctx.fillText('VALOR', 940, 95)
  ctx.font = '700 42px Arial, sans-serif'
  ctx.fillText(formatBRLFromCents(row.dayTotalCents), 1120, 95)
  ctx.font = '500 32px Arial, sans-serif'
  ctx.fillText('Recebi (emos) de', 66, 215)
  ctx.font = '700 33px Arial, sans-serif'
  ctx.fillText('FLOW — Central de Gestão e Operações', 365, 215)
  ctx.strokeStyle = '#777'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(360, 225); ctx.lineTo(1515, 225); ctx.stroke()
  ctx.font = '500 32px Arial, sans-serif'
  ctx.fillStyle = '#111'
  ctx.fillText('a quantia de', 66, 290)
  ctx.font = '700 40px Arial, sans-serif'
  ctx.fillText(formatBRLFromCents(row.dayTotalCents), 310, 290)
  ctx.font = '500 31px Arial, sans-serif'
  ctx.fillText('Referente a vale-alimentação e vale-transporte.', 66, 390)
  ctx.beginPath(); ctx.moveTo(65, 410); ctx.lineTo(1515, 410); ctx.stroke()
  ctx.fillText('E para clareza firmo (amos) o presente.', 66, 468)
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())
  ctx.font = '500 27px Arial, sans-serif'
  ctx.fillText(`São Paulo, ${date}.`, 66, 540)
  ctx.beginPath(); ctx.moveTo(65, 562); ctx.lineTo(1515, 562); ctx.stroke()
  ctx.font = '600 31px Arial, sans-serif'
  ctx.fillText('Assinatura', 66, 650)
  ctx.beginPath(); ctx.moveTo(265, 658); ctx.lineTo(1515, 658); ctx.stroke()
  ctx.fillText('Emitente', 66, 720)
  ctx.font = '700 30px Arial, sans-serif'
  ctx.fillText('FLOW — Central de Gestão e Operações', 265, 720)
  ctx.beginPath(); ctx.moveTo(265, 728); ctx.lineTo(1515, 728); ctx.stroke()
  ctx.font = '600 29px Arial, sans-serif'
  ctx.fillText(`CPF ${row.cpf ? formatCpf(row.cpf) : 'não informado'}`, 66, 790)
  ctx.fillText('RG conforme documento anexo', 770, 790)
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
  pdf.text(`CPF: ${row.cpf ? formatCpf(row.cpf) : 'não informado'}     VALOR: ${formatBRLFromCents(row.dayTotalCents)}`, 14, 27)
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
    const rg = await loadImage(row.rgImage!)
    const receipt = await loadImage(receiptImage(row, row.receiptNumber ?? String(index + 1).padStart(5, '0')))
    const signature = await loadImage(row.paymentSignature!)
    const rgRatio = rg.width / rg.height
    const rgH = Math.min(105, 168 / rgRatio)
    const rgW = rgH * rgRatio
    const rgX = (PAGE_W - rgW) / 2
    pdf.setFontSize(9); pdf.setTextColor(75, 75, 75); pdf.text('RG — DOCUMENTO DE IDENTIDADE', 14, 39)
    pdf.addImage(rg, 'JPEG', rgX, 43, rgW, rgH, undefined, 'FAST')
    const receiptY = 43 + rgH + 11
    pdf.setFontSize(9); pdf.text('RECIBO DE PAGAMENTO', 14, receiptY - 3)
    pdf.addImage(receipt, 'PNG', 14, receiptY, 182, 97, undefined, 'FAST')
    pdf.addImage(signature, 'PNG', 48, receiptY + 67, 145, 17, undefined, 'FAST')
  }
  const blob = pdf.output('blob')
  await exportFile(blob, `recibos-pagamentos-${new Date().toISOString().slice(0, 10)}.pdf`, 'Finalizar pagamento')
}
