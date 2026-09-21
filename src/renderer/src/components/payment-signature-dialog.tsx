import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Eraser, Loader2, PenLine, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { Dialog } from '@/components/ui/dialog'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { cn } from '@/lib/utils'

type PaymentSignatureDialogProps = {
  open: boolean
  employeeName: string
  amountLabel: string
  saving?: boolean
  onClose: () => void
  onConfirm: (signature: string) => Promise<void> | void
}

function SignaturePad({ onReady }: { onReady: (value: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const resizeFrame = useRef<number | null>(null)

  const setup = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(bounds.width * scale))
    canvas.height = Math.max(1, Math.round(bounds.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 2.35
    context.strokeStyle = '#121212'
    context.imageSmoothingEnabled = true
  }

  useEffect(() => {
    setup()
    const observer = new ResizeObserver(() => {
      // ResizeObserver pode disparar diversas vezes durante a rotação. Não
      // recriamos o canvas no meio de um traço.
      if (drawing.current || resizeFrame.current !== null) return
      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = null
        setup()
      })
    })
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => {
      observer.disconnect()
      if (resizeFrame.current !== null) window.cancelAnimationFrame(resizeFrame.current)
    }
  }, [])

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = point(event)
    drawing.current = true
    lastPoint.current = next
    context.beginPath()
    context.arc(next.x, next.y, context.lineWidth / 2, 0, Math.PI * 2)
    context.fillStyle = '#121212'
    context.fill()
    hasInk.current = true
  }

  const drawTo = (next: { x: number; y: number }) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const previous = lastPoint.current
    if (!context || !previous) return
    const middle = { x: (previous.x + next.x) / 2, y: (previous.y + next.y) / 2 }
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.quadraticCurveTo(previous.x, previous.y, middle.x, middle.y)
    context.stroke()
    lastPoint.current = next
    hasInk.current = true
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    // Eventos coalescidos preservam os pontos físicos da caneta/dedo mesmo
    // quando a tela está ocupada, removendo o aspecto quebrado do risco.
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const pointer of coalesced) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      drawTo({ x: pointer.clientX - rect.left, y: pointer.clientY - rect.top })
    }
  }
  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    lastPoint.current = null
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Alguns WebViews já liberam a captura antes do pointerup.
    }
    if (hasInk.current && canvasRef.current) onReady(canvasRef.current.toDataURL('image/png'))
  }
  const clear = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    hasInk.current = false
    lastPoint.current = null
    onReady(null)
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#171717]/15 bg-white shadow-inner">
      <div className="flex items-center justify-between border-b border-[#171717]/10 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#171717]/55"><PenLine className="size-3.5" /> Assine dentro da área</span>
        <button type="button" onClick={clear} className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[11px] text-[#171717]/55 hover:bg-black/5">
          <Eraser className="size-3.5" /> Limpar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="h-[250px] w-full touch-none cursor-crosshair overscroll-none select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  )
}

function SignatureContent({ employeeName, amountLabel, saving, onClose, onConfirm, mobile }: Omit<PaymentSignatureDialogProps, 'open'> & { mobile: boolean }) {
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    if (!signature) { setError('Peça para a pessoa desenhar a assinatura antes de confirmar.'); return }
    setError(null)
    await onConfirm(signature)
  }
  return (
    <div className={cn(mobile ? 'flex h-full flex-col bg-[#111111] p-5' : 'px-5 pb-5')}>
      {mobile ? <div className="mb-3 flex items-center justify-between"><div><p className="text-[16px] text-[#F0EFEC]/90">Confirmação de recebimento</p><p className="mt-0.5 text-[12px] text-[#F0EFEC]/40">Assine horizontalmente</p></div><button type="button" onClick={onClose} className="rounded-[8px] p-2 text-[#F0EFEC]/55"><X className="size-4" /></button></div> : null}
      <div className={cn('mb-4 rounded-[12px] border border-white/[0.07] bg-white/[0.03] px-3.5 py-3', mobile && 'grid grid-cols-2 gap-4')}>
        <div><p className="text-[11px] text-[#F0EFEC]/35">Recebedor</p><p className="mt-0.5 truncate text-[14px] text-[#F0EFEC]/82">{employeeName}</p></div>
        <div><p className="text-[11px] text-[#F0EFEC]/35">Valor a receber</p><p className="mt-0.5 text-[14px] text-[#F0EFEC]/82">{amountLabel}</p></div>
      </div>
      <SignaturePad onReady={setSignature} />
      {error ? <p className="mt-2 text-[12px] text-red-300">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        {!mobile ? <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-[9px] px-3 text-[13px] text-[#F0EFEC]/48 hover:bg-white/[0.04]">Cancelar</button> : null}
        <button type="button" disabled={!signature || saving} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111] disabled:opacity-40">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar pagamento
        </button>
      </div>
    </div>
  )
}

export function PaymentSignatureDialog(props: PaymentSignatureDialogProps) {
  const mobile = isMobileShell()
  useEffect(() => {
    if (!props.open || !mobile) return
    let active = true
    void import('@capacitor/screen-orientation').then(async ({ ScreenOrientation }) => {
      if (active) await ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => undefined)
    }).catch(() => undefined)
    return () => {
      active = false
      void import('@capacitor/screen-orientation').then(({ ScreenOrientation }) => ScreenOrientation.unlock()).catch(() => undefined)
    }
  }, [props.open, mobile])

  if (!props.open) return null
  if (!mobile) {
    return <Dialog open title="Assinar recebimento" description="A assinatura será guardada no recibo antes de marcar o vale como pago." wide onClose={props.onClose}>
      <SignatureContent {...props} mobile={false} />
    </Dialog>
  }
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[600] h-[100dvh] w-[100dvw] overflow-auto bg-[#111111]">
      <SignatureContent {...props} mobile />
    </motion.div>,
    document.body
  )
}
