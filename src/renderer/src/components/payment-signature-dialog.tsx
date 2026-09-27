import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Eraser, Loader2, PenLine, Smartphone, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog } from '@/components/ui/dialog'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { operations, operationError } from '@/lib/operations'
import type { SignatureStrokePoint } from '../../../shared/operations'

/* ================================================================== */
/* Motor de traço — estilo app de desenho: largura variável, contorno  */
/* preenchido (nada de pontilhado/cortado), suavizado por velocidade.  */
/* ================================================================== */

type InkPoint = { x: number; y: number; p: number }

const TAU = Math.PI * 2

function clampInk(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function inkRadius(cur: InkPoint, prev: InkPoint | null, size: number): number {
  const dist = prev ? Math.hypot(cur.x - prev.x, cur.y - prev.y) : 0
  const speed = clampInk(1 - dist / 48, 0.3, 1)
  const pressure = clampInk(cur.p || 0.62, 0.35, 1)
  const t = 0.55 * speed + 0.45 * pressure
  return Math.max(0.7, (size / 2) * (0.55 + 0.45 * t))
}

/** Constrói o contorno preenchido do traço ( PerfectFreehand-like, MIT-style ). */
function inkStrokePath(points: InkPoint[], size: number): Path2D | null {
  const dense: InkPoint[] = []
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i]
    const prev = dense[dense.length - 1]
    if (prev) {
      const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y)
      if (dist < 0.7) continue
      const steps = Math.min(10, Math.floor(dist / 5))
      for (let s = 1; s <= steps; s += 1) {
        const t = s / (steps + 1)
        dense.push({
          x: prev.x + (cur.x - prev.x) * t,
          y: prev.y + (cur.y - prev.y) * t,
          p: prev.p + (cur.p - prev.p) * t
        })
      }
    }
    dense.push({ x: cur.x, y: cur.y, p: cur.p })
  }
  if (dense.length === 0) return null

  const path = new Path2D()
  if (dense.length === 1) {
    path.arc(dense[0].x, dense[0].y, inkRadius(dense[0], null, size), 0, TAU)
    return path
  }

  const left: Array<{ x: number; y: number }> = []
  const right: Array<{ x: number; y: number }> = []
  for (let i = 0; i < dense.length; i += 1) {
    const prev = dense[Math.max(0, i - 1)]
    const next = dense[Math.min(dense.length - 1, i + 1)]
    let dx = next.x - prev.x
    let dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const r = inkRadius(dense[i], i > 0 ? dense[i - 1] : null, size)
    left.push({ x: dense[i].x - dy * r, y: dense[i].y + dx * r })
    right.push({ x: dense[i].x + dy * r, y: dense[i].y - dx * r })
  }

  path.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i += 1) {
    const midX = (left[i - 1].x + left[i].x) / 2
    const midY = (left[i - 1].y + left[i].y) / 2
    path.quadraticCurveTo(left[i - 1].x, left[i - 1].y, midX, midY)
  }
  path.lineTo(left[left.length - 1].x, left[left.length - 1].y)
  for (let i = right.length - 1; i > 0; i -= 1) {
    const midX = (right[i].x + right[i - 1].x) / 2
    const midY = (right[i].y + right[i - 1].y) / 2
    path.quadraticCurveTo(right[i].x, right[i].y, midX, midY)
  }
  path.lineTo(right[0].x, right[0].y)
  path.closePath()

  // Pontas arredondadas
  const firstR = inkRadius(dense[0], null, size)
  const lastR = inkRadius(dense[dense.length - 1], dense[dense.length - 2], size)
  path.moveTo(dense[0].x + firstR, dense[0].y)
  path.arc(dense[0].x, dense[0].y, firstR, 0, TAU)
  const last = dense[dense.length - 1]
  path.moveTo(last.x + lastR, last.y)
  path.arc(last.x, last.y, lastR, 0, TAU)
  return path
}

function paintInk(
  ctx: CanvasRenderingContext2D,
  strokes: InkPoint[][],
  size: number,
  color: string
): void {
  ctx.fillStyle = color
  for (const stroke of strokes) {
    const path = inkStrokePath(stroke, size)
    if (path) ctx.fill(path)
  }
}

/** Separa a lista plana da sessão (pontos com marcador m=1) em traços. */
function strokesFromFlat(flat: SignatureStrokePoint[]): InkPoint[][] {
  const result: InkPoint[][] = []
  let current: InkPoint[] | null = null
  for (const point of flat) {
    if (point.m === 1 || Math.abs(point.x) > 1.5 || Math.abs(point.y) > 1.5) {
      // Marcador de novo traço (m=1) ou ponto fora do espaço normalizado.
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

/** Renderiza a assinatura sincronizada em PNG com fundo branco, recortada na área da tinta. */
export function signatureDataUrlFromNormalized(
  normalized: InkPoint[][],
  aspect: number
): string {
  const width = 1000
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
  const pad = Math.max(24, Math.max(maxX - minX, maxY - minY) * 0.08)
  const x0 = Math.max(0, minX - pad)
  const y0 = Math.max(0, minY - pad)
  const boxW = Math.min(width - x0, maxX - minX + pad * 2)
  const boxH = Math.min(height - y0, maxY - minY + pad * 2)
  const upscale = clampInk(1400 / Math.max(boxW, 1), 1, 3)

  const canvas = document.createElement('canvas')
  canvas.width = Math.min(2200, Math.round(boxW * upscale))
  canvas.height = Math.min(2200, Math.round(boxH * upscale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível renderizar a assinatura.')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(canvas.width / boxW, canvas.height / boxH)
  ctx.translate(-x0, -y0)
  paintInk(ctx, scaled, 6.5, '#121212')
  return canvas.toDataURL('image/png')
}

/* ================================================================== */
/* Propriedades compartilhadas                                         */
/* ================================================================== */

type PaymentSignatureDialogProps = {
  open: boolean
  employeeName: string
  amountLabel: string
  saving?: boolean
  onClose: () => void
  onConfirm: (signature: string) => Promise<void> | void
}

/* ================================================================== */
/* Pad local (desktop e mobile "padrão") com o motor suave             */
/* ================================================================== */

function useInkCanvas(options: {
  size: number
  color?: string
  background: string
  onInkChange?: (hasInk: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<InkPoint[][]>([])
  const currentRef = useRef<InkPoint[]>([])
  const drawingRef = useRef(false)
  const dirtyRef = useRef(true)
  const frameRef = useRef<number | null>(null)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const setup = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(bounds.width * scale))
    canvas.height = Math.max(1, Math.round(bounds.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    dirtyRef.current = true
  }, [])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const scale = canvas.width / Math.max(1, canvas.getBoundingClientRect().width)
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = optionsRef.current.background
    ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale)
    const all = currentRef.current.length
      ? [...strokesRef.current, currentRef.current]
      : strokesRef.current
    paintInk(ctx, all, optionsRef.current.size, optionsRef.current.color ?? '#121212')
    ctx.restore()
  }, [])

  useEffect(() => {
    const loop = () => {
      if (dirtyRef.current) {
        dirtyRef.current = false
        render()
      }
      frameRef.current = window.requestAnimationFrame(loop)
    }
    frameRef.current = window.requestAnimationFrame(loop)
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [render])

  const clear = useCallback(() => {
    strokesRef.current = []
    currentRef.current = []
    dirtyRef.current = true
    optionsRef.current.onInkChange?.(false)
  }, [])

  const toDataUrl = useCallback(async (): Promise<string> => {
    // Garante o último frame renderizado antes de exportar.
    render()
    const canvas = canvasRef.current
    if (!canvas) throw new Error('Não foi possível capturar a assinatura.')
    return canvas.toDataURL('image/png')
  }, [render])

  const localPoint = useCallback((clientX: number, clientY: number): InkPoint | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      p: 0.62
    }
  }, [])

  return {
    canvasRef,
    setup,
    clear,
    toDataUrl,
    localPoint,
    drawingRef,
    strokesRef,
    currentRef,
    dirtyRef,
    lastRef
  }
}

function SignaturePad({ onReady }: { onReady: (value: string | null) => void }) {
  const [, setHasInk] = useState(false)
  const ink = useInkCanvas({ size: 4.4, background: '#FFFFFF', onInkChange: setHasInk })
  const resizeFrame = useRef<number | null>(null)

  useEffect(() => {
    ink.setup()
    const observer = new ResizeObserver(() => {
      if (ink.drawingRef.current || resizeFrame.current !== null) return
      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = null
        ink.setup()
      })
    })
    if (ink.canvasRef.current) observer.observe(ink.canvasRef.current)
    return () => observer.disconnect()
  }, [ink])

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = ink.localPoint(event.clientX, event.clientY)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pressure = event.pressure > 0 && event.pressure < 1 ? event.pressure : 0.62
    ink.currentRef.current = [{ ...point, p: pressure }]
    ink.drawingRef.current = true
    ink.lastRef.current = { x: point.x, y: point.y }
    ink.dirtyRef.current = true
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawingRef.current) return
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const pointer of coalesced) {
      const point = ink.localPoint(pointer.clientX, pointer.clientY)
      if (!point) continue
      const previous = ink.lastRef.current
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1.1) continue
      const pressure = pointer.pressure > 0 && pointer.pressure < 1 ? pointer.pressure : 0.62
      ink.currentRef.current.push({ ...point, p: pressure })
      ink.lastRef.current = { x: point.x, y: point.y }
    }
    ink.dirtyRef.current = true
  }

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawingRef.current) return
    ink.drawingRef.current = false
    if (ink.currentRef.current.length > 0) {
      ink.strokesRef.current.push(ink.currentRef.current)
      ink.currentRef.current = []
      setHasInk(true)
      ink.lastRef.current = null
      ink.dirtyRef.current = true
      void ink.toDataUrl().then((value) => onReady(value))
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Alguns WebViews já liberam a captura antes do pointerup.
    }
  }

  const clear = () => {
    ink.clear()
    onReady(null)
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#171717]/15 bg-white shadow-inner">
      <div className="flex items-center justify-between border-b border-[#171717]/10 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#171717]/55">
          <PenLine className="size-3.5" /> Assine dentro da área
        </span>
        <button
          type="button"
          onClick={clear}
          className="inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[11px] text-[#171717]/55 hover:bg-black/5"
        >
          <Eraser className="size-3.5" /> Limpar
        </button>
      </div>
      <canvas
        ref={ink.canvasRef}
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

/* ================================================================== */
/* Desktop — pad local OU assinatura sincronizada com o celular        */
/* ================================================================== */

type SyncSessionState = {
  code: string
  status: string
  strokes: SignatureStrokePoint[]
  aspect: number
}

function DesktopSyncPanel({
  onDone,
  onBack
}: {
  onDone: (signature: string) => Promise<void> | void
  onBack: () => void
}) {
  const [codeInput, setCodeInput] = useState('')
  const [askingCode, setAskingCode] = useState(false)
  const [session, setSession] = useState<SyncSessionState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const sessionRef = useRef<SyncSessionState | null>(null)
  sessionRef.current = session
  const lastFingerprint = useRef('')

  const stopPolling = useRef(false)

  useEffect(() => {
    stopPolling.current = false
    const tick = async () => {
      const current = sessionRef.current
      if (!current || stopPolling.current) return
      try {
        const next = await operations().getSignatureSession({ code: current.code })
        const fingerprint = `${next.status}:${next.strokes.length}`
        if (fingerprint !== lastFingerprint.current) {
          lastFingerprint.current = fingerprint
          setSession({ code: current.code, status: next.status, strokes: next.strokes, aspect: next.aspect })
        }
      } catch {
        // rede instável: tenta de novo no próximo tick
      }
    }
    const timer = window.setInterval(() => void tick(), 650)
    return () => {
      stopPolling.current = true
      window.clearInterval(timer)
    }
  }, [])

  // Sessão expirou ou foi cancelada no celular.
  useEffect(() => {
    if (!session) return
    if (session.status === 'cancelled' || session.status === 'expired') {
      setSession(null)
      setSignatureUrl(null)
      setCodeInput('')
      setAskingCode(true)
      setError(
        session.status === 'cancelled'
          ? 'A assinatura foi cancelada no celular.'
          : 'O código expirou. Peça um novo no celular.'
      )
    }
  }, [session])

  // Assinatura recebida: renderiza o PNG uma única vez.
  useEffect(() => {
    if (!session || session.status === 'cancelled' || session.status === 'expired') return
    if (session.strokes.length < 8 || signatureUrl) return
    try {
      const url = signatureDataUrlFromNormalized(
        strokesFromFlat(session.strokes),
        session.aspect
      )
      setSignatureUrl(url)
    } catch {
      // ainda desenhando
    }
  }, [session, signatureUrl])

  async function connect(): Promise<void> {
    const code = codeInput.replace(/\D/g, '')
    if (code.length !== 4) {
      setError('Digite os 4 dígitos mostrados no celular.')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const linked = await operations().joinSignatureSession({ code })
      lastFingerprint.current = `${linked.status}:${linked.strokes.length}`
      setSession({ code, status: linked.status, strokes: linked.strokes, aspect: linked.aspect })
    } catch (joinError) {
      setError(operationError(joinError))
    } finally {
      setConnecting(false)
    }
  }

  async function confirm(): Promise<void> {
    if (!session || !signatureUrl) return
    setConfirming(true)
    setError(null)
    try {
      await operations().confirmSignatureSession({ code: session.code })
      confirmedRef.current = true
      await onDone(signatureUrl)
    } catch (confirmError) {
      setError(operationError(confirmError))
    } finally {
      setConfirming(false)
    }
  }

  // Ao desmontar sem confirmar (Voltar/fechar), encerra a sessão para não
  // pendurar código válido no banco.
  const confirmedRef = useRef(false)
  useEffect(() => {
    return () => {
      if (confirmedRef.current) return
      const active = sessionRef.current
      if (active) void operations().cancelSignatureSession({ code: active.code }).catch(() => undefined)
    }
  }, [])

  const signed = Boolean(session && session.strokes.length >= 8 && signatureUrl)
  const linkedWaiting = Boolean(session && !signed)
  const previewWidth = useMemo(() => {
    const aspect = session?.aspect ?? 0.5
    return Math.round(Math.min(260, 340 * clampInk(aspect, 0.3, 1.2)))
  }, [session?.aspect])

  return (
    <div className="px-5 pb-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[#F0EFEC]/85">Assinatura digital via celular</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#F0EFEC]/42">
            No celular, abra <span className="text-[#F0EFEC]/65">Vales e pagamentos</span> e toque em
            {' '}<span className="text-[#F0EFEC]/65">Assinatura digital</span>. Digite aqui o código de 4 dígitos.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[12px] text-[#F0EFEC]/45 hover:bg-white/[0.05] hover:text-[#F0EFEC]/75"
        >
          <X className="size-3.5" /> Pad local
        </button>
      </div>

      {!session ? (
        <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-4">
          {!askingCode ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="grid size-12 place-items-center rounded-full bg-[#34D399]/10 text-[#34D399]">
                <Smartphone className="size-6" strokeWidth={1.6} />
              </div>
              <p className="text-[13px] text-[#F0EFEC]/60">O celular mostra um código de 4 dígitos.</p>
              <button
                type="button"
                onClick={() => setAskingCode(true)}
                className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111]"
              >
                Inserir Código
              </button>
            </div>
          ) : (
            <div className="py-1">
              <label htmlFor="signature-sync-code" className="block text-[12px] text-[#F0EFEC]/48">
                Código do celular
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="signature-sync-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={4}
                  value={codeInput}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 4)
                    setCodeInput(digits)
                    if (digits.length === 4) void connect()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void connect()
                  }}
                  placeholder="0000"
                  className="h-11 flex-1 rounded-[10px] border border-white/[0.09] bg-white/[0.03] text-center text-[22px] font-semibold tracking-[0.45em] text-[#F0EFEC] outline-none placeholder:text-[#F0EFEC]/18 focus:border-[#F0EFEC]/25"
                />
                <button
                  type="button"
                  disabled={connecting || codeInput.replace(/\D/g, '').length !== 4}
                  onClick={() => void connect()}
                  className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111] disabled:opacity-40"
                >
                  {connecting ? <Loader2 className="size-4 animate-spin" /> : null} Conectar
                </button>
              </div>
            </div>
          )}
          {error ? <p className="mt-3 text-center text-[12px] text-red-300/85">{error}</p> : null}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-4">
          <div
            className="relative overflow-hidden rounded-[22px] border-[5px] border-[#0A0A0A] bg-white shadow-[0_10px_36px_rgba(0,0,0,0.45)]"
            style={{ width: previewWidth, height: Math.round(previewWidth / clampInk(session.aspect, 0.3, 4)) }}
          >
            <SyncPreviewCanvas strokes={session.strokes} aspect={session.aspect} />
            {linkedWaiting ? (
              <div className="absolute inset-0 grid place-items-center bg-white/85">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="size-6 animate-spin text-[#111]/70" />
                  <p className="text-[11px] font-medium text-[#111]/55">Aguardando assinatura…</p>
                </div>
              </div>
            ) : null}
            {signed ? (
              <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#34D399] px-2 py-0.5 text-[10px] font-semibold text-[#052e1c]">
                <Check className="size-3" strokeWidth={3} /> Recebida
              </div>
            ) : null}
          </div>
          <p className="text-[12px] text-[#F0EFEC]/45">
            {signed
              ? 'Assinatura recebida do celular. Confira e confirme o pagamento.'
              : 'Conectado. Peça para assinar com o dedo no celular.'}
          </p>
        </div>
      )}

      {error && session ? <p className="mt-2 text-[12px] text-red-300/85">{error}</p> : null}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={confirming}
          className="h-9 rounded-[9px] px-3 text-[13px] text-[#F0EFEC]/48 hover:bg-white/[0.04] disabled:opacity-40"
        >
          Voltar
        </button>
        <button
          type="button"
          disabled={!signed || confirming}
          onClick={() => void confirm()}
          className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111] disabled:opacity-40"
        >
          {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar pagamento
        </button>
      </div>
    </div>
  )
}

function SyncPreviewCanvas({ strokes, aspect }: { strokes: SignatureStrokePoint[]; aspect: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawnRef = useRef(-1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || strokes.length === drawnRef.current) return
    drawnRef.current = strokes.length
    const bounds = canvas.getBoundingClientRect()
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(bounds.width * scale))
    canvas.height = Math.max(1, Math.round(bounds.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, bounds.width, bounds.height)
    const virtualWidth = 1000
    const virtualHeight = Math.round(virtualWidth / clampInk(aspect || 0.5, 0.3, 4))
    const mapped = strokesFromFlat(strokes).map((stroke) =>
      stroke.map((point) => ({
        x: point.x * bounds.width,
        y: point.y * bounds.height,
        p: point.p
      }))
    )
    void virtualWidth
    void virtualHeight
    paintInk(ctx, mapped, (6.5 * bounds.width) / 1000, '#121212')
  }, [strokes, aspect])

  return <canvas ref={canvasRef} className="h-full w-full" />
}

function DesktopSignatureContent({
  employeeName,
  amountLabel,
  saving,
  onClose,
  onConfirm
}: Omit<PaymentSignatureDialogProps, 'open'>) {
  const [mode, setMode] = useState<'pad' | 'sync'>('pad')
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Saindo do modo sync: encerra a sessão ativa para não pendurar código válido.
  useEffect(() => {
    if (mode !== 'sync') return
    return () => {
      setSignature(null)
      setError(null)
    }
  }, [mode])

  async function submitLocal(): Promise<void> {
    if (!signature) {
      setError('Peça para a pessoa desenhar a assinatura antes de confirmar.')
      return
    }
    setError(null)
    await onConfirm(signature)
  }

  return (
    <div className="px-5 pb-5">
      {mode === 'pad' ? (
        <>
          <div className="mb-4 rounded-[12px] border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
            <p className="text-[11px] text-[#F0EFEC]/35">Recebedor</p>
            <p className="mt-0.5 truncate text-[14px] text-[#F0EFEC]/82">{employeeName}</p>
            <p className="mt-2 text-[11px] text-[#F0EFEC]/35">Valor a receber</p>
            <p className="mt-0.5 text-[14px] text-[#F0EFEC]/82">{amountLabel}</p>
          </div>
          <SignaturePad onReady={setSignature} />
          {error ? <p className="mt-2 text-[12px] text-red-300">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode('sync')}
              className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-white/[0.09] px-3.5 text-[13px] text-[#F0EFEC]/70 hover:bg-white/[0.04] hover:text-[#F0EFEC]"
            >
              <Smartphone className="size-4" /> Assinatura digital
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-10 rounded-[9px] px-3 text-[13px] text-[#F0EFEC]/48 hover:bg-white/[0.04] disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!signature || saving}
              onClick={() => void submitLocal()}
              className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111] disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar pagamento
            </button>
          </div>
        </>
      ) : (
        <DesktopSyncPanel onDone={onConfirm} onBack={() => setMode('pad')} />
      )}
    </div>
  )
}

/* ================================================================== */
/* Mobile — pad local, código de pareamento, tela branca e espera       */
/* ================================================================== */

type MobileSyncPhase = 'code' | 'draw' | 'wait'

export function MobileSignatureSyncOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<MobileSyncPhase>('code')
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const codeRef = useRef<string | null>(null)

  const createSession = useCallback(async () => {
    setCreating(true)
    setError(null)
    try {
      const previous = codeRef.current
      if (previous) {
        codeRef.current = null
        void operations().cancelSignatureSession({ code: previous }).catch(() => undefined)
      }
      const aspect = window.innerWidth / Math.max(1, window.innerHeight)
      const session = await operations().createSignatureSession({ aspect })
      codeRef.current = session.code
      setCode(session.code)
      setPhase('code')
    } catch (createError) {
      setError(operationError(createError))
    } finally {
      setCreating(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setPhase('code')
      setCode(null)
      setError(null)
      codeRef.current = null
      return
    }
    void createSession()
  }, [open, createSession])



  // Poll do modo código: quando o PC conectar, vai para a tela branca.
  useEffect(() => {
    if (!open || phase !== 'code' || !code) return
    let stopped = false
    const timer = window.setInterval(async () => {
      if (stopped) return
      try {
        const session = await operations().getSignatureSession({ code })
        if (stopped) return
        if (session.status === 'linked') setPhase('draw')
        if (session.status === 'cancelled' || session.status === 'expired') {
          stopped = true
          setError(session.status === 'cancelled' ? 'Cancelado no computador.' : 'Código expirado.')
          setCode(null)
          codeRef.current = null
        }
      } catch {
        // tenta de novo
      }
    }, 1000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [open, phase, code])

  // Poll do modo espera: PC confirmou → sai.
  useEffect(() => {
    if (!open || phase !== 'wait' || !code) return
    let stopped = false
    const timer = window.setInterval(async () => {
      if (stopped) return
      try {
        const session = await operations().getSignatureSession({ code })
        if (stopped) return
        if (session.status === 'confirmed') {
          stopped = true
          onClose()
        }
      } catch {
        // tenta de novo
      }
    }, 900)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [open, phase, code, onClose])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[700] h-[100dvh] w-[100dvw] overflow-hidden bg-[#111111]"
      >
        {phase === 'code' ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 pt-4">
              <span className="text-[12px] tracking-wide text-[#F0EFEC]/35 uppercase">Assinatura digital</span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[8px] p-2 text-[#F0EFEC]/55 hover:bg-white/[0.05]"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
              <div className="grid size-14 place-items-center rounded-full bg-[#34D399]/10 text-[#34D399]">
                <Smartphone className="size-7" strokeWidth={1.6} />
              </div>
              {creating || !code ? (
                <Loader2 className="size-6 animate-spin text-[#F0EFEC]/40" />
              ) : (
                <>
                  <p className="text-[13px] text-[#F0EFEC]/50">Digite no computador este código</p>
                  <p className="text-[52px] leading-none font-semibold tracking-[0.28em] text-[#F0EFEC] tabular-nums">
                    {code}
                  </p>
                  <div className="flex items-center gap-2 text-[12px] text-[#F0EFEC]/38">
                    <Loader2 className="size-3.5 animate-spin" />
                    Aguardando o computador conectar…
                  </div>
                </>
              )}
              {error ? <p className="text-[12px] text-red-300/85">{error}</p> : null}
              {error ? (
                <button
                  type="button"
                  onClick={() => void createSession()}
                  className="inline-flex h-10 items-center rounded-[10px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111]"
                >
                  Gerar novo código
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {phase === 'draw' ? (
          <MobileDrawScreen
            code={code}
            onSent={() => setPhase('wait')}
            onCancel={async () => {
              const active = codeRef.current
              if (active) await operations().cancelSignatureSession({ code: active }).catch(() => undefined)
              onClose()
            }}
            onExpired={onClose}
          />
        ) : null}

        {phase === 'wait' ? (
          <div className="relative flex h-full flex-col items-center justify-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 rounded-[8px] p-2 text-[#F0EFEC]/55 hover:bg-white/[0.05]"
              aria-label="Sair do modo de sincronização"
            >
              <X className="size-4" />
            </button>
            <Loader2 className="size-8 animate-spin text-[#F0EFEC]/70" />
            <p className="text-[13px] text-[#F0EFEC]/50">Enviado! Confirmando no computador…</p>
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

/** Tela INTEIRA branca para assinar com o dedo, com envio em tempo real. */
function MobileDrawScreen({
  code,
  onSent,
  onCancel,
  onExpired
}: {
  code: string | null
  onSent: () => void
  onCancel: () => void
  onExpired: () => void
}) {
  const ink = useInkCanvas({ size: 6, background: '#FFFFFF' })
  const [sending, setSending] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const pendingRef = useRef<SignatureStrokePoint[]>([])
  const pushingRef = useRef(false)
  const doneRef = useRef(false)
  const resizeFrame = useRef<number | null>(null)

  useEffect(() => {
    ink.setup()
    ink.clear()
    const observer = new ResizeObserver(() => {
      if (ink.drawingRef.current || resizeFrame.current !== null) return
      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = null
        ink.setup()
      })
    })
    if (ink.canvasRef.current) observer.observe(ink.canvasRef.current)
    return () => observer.disconnect()
  }, [ink])

  // Envio em tempo real: lotes pequenos a cada 130ms.
  useEffect(() => {
    if (!code) return
    const timer = window.setInterval(async () => {
      if (pushingRef.current || pendingRef.current.length === 0 || doneRef.current) return
      const batch = pendingRef.current
      pendingRef.current = []
      pushingRef.current = true
      try {
        await operations().pushSignatureStrokes({ code, strokes: batch })
      } catch {
        // Reenfileira para tentar de novo no próximo tick.
        pendingRef.current = [...batch, ...pendingRef.current]
      } finally {
        pushingRef.current = false
      }
    }, 130)
    return () => window.clearInterval(timer)
  }, [code])

  // Segurança: PC cancelou/encerrou a sessão → sai da tela branca sozinho.
  useEffect(() => {
    if (!code) return
    let stopped = false
    const timer = window.setInterval(async () => {
      if (stopped || doneRef.current) return
      try {
        const session = await operations().getSignatureSession({ code })
        if (stopped || doneRef.current) return
        if (session.status === 'cancelled' || session.status === 'expired') onExpired()
      } catch {
        // tenta de novo
      }
    }, 1500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [code, onExpired])

  const normalizedPoint = (clientX: number, clientY: number): InkPoint | null => {
    const canvas = ink.canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / Math.max(1, rect.width),
      y: (clientY - rect.top) / Math.max(1, rect.height),
      p: 0.62
    }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = normalizedPoint(event.clientX, event.clientY)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pressure = event.pressure > 0 && event.pressure < 1 ? event.pressure : 0.62
    ink.currentRef.current = [{ ...point, p: pressure }]
    ink.drawingRef.current = true
    ink.lastRef.current = { x: point.x, y: point.y }
    ink.dirtyRef.current = true
    pendingRef.current.push({
      x: Math.round(point.x * 10000) / 10000,
      y: Math.round(point.y * 10000) / 10000
    })
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawingRef.current) return
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const pointer of coalesced) {
      const point = normalizedPoint(pointer.clientX, pointer.clientY)
      if (!point) continue
      const previous = ink.lastRef.current
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015) continue
      const pressure = pointer.pressure > 0 && pointer.pressure < 1 ? pointer.pressure : 0.62
      ink.currentRef.current.push({ ...point, p: pressure })
      ink.lastRef.current = { x: point.x, y: point.y }
      pendingRef.current.push({
        x: Math.round(point.x * 10000) / 10000,
        y: Math.round(point.y * 10000) / 10000
      })
    }
    ink.dirtyRef.current = true
  }

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawingRef.current) return
    ink.drawingRef.current = false
    ink.lastRef.current = null
    if (ink.currentRef.current.length > 0) {
      ink.strokesRef.current.push(ink.currentRef.current)
      ink.currentRef.current = []
      setHasInk(true)
      ink.dirtyRef.current = true
      // Marca o início de um novo traço no fluxo sincronizado.
      pendingRef.current.push({ x: -1, y: -1, m: 1 })
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // captura já liberada
    }
  }

  const clear = () => {
    ink.clear()
    pendingRef.current = [{ x: -1, y: -1, m: 1 }]
    setHasInk(false)
    if (code) void operations().pushSignatureStrokes({ code, reset: true }).catch(() => undefined)
  }

  async function send(): Promise<void> {
    if (!code || sending) return
    setSending(true)
    try {
      doneRef.current = true
      // Aguarda o último lote sair (máx ~2s).
      for (let i = 0; i < 16 && pendingRef.current.length > 0; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 120))
      }
      await operations().finishSignatureSession({ code })
      onSent()
    } catch (sendError) {
      doneRef.current = false
      setError(operationError(sendError))
    } finally {
      setSending(false)
    }
  }

  const [error, setError] = useState<string | null>(null)

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[720] h-[100dvh] w-[100dvw] overflow-hidden bg-white"
    >
      <canvas
        ref={ink.canvasRef}
        className="absolute inset-0 h-full w-full touch-none overscroll-none select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
      />

      <div className="pointer-events-none absolute top-4 left-4">
        <span className="inline-flex items-center rounded-full border border-[#111]/15 bg-white/85 px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] text-[#111]/70 uppercase">
          Assine
        </span>
      </div>

      <button
        type="button"
        onClick={() => void onCancel()}
        className="absolute top-3.5 right-3.5 z-10 grid size-9 place-items-center rounded-full text-[#111]/55 hover:bg-[#111]/5"
        aria-label="Cancelar assinatura"
      >
        <X className="size-5" />
      </button>

      {!hasInk && !sending ? (
        <p className="pointer-events-none absolute inset-x-0 top-[46%] text-center text-[15px] font-medium text-[#111]/25">
          Assine com o dedo
        </p>
      ) : null}

      <div className="absolute right-5 bottom-6 z-10 flex items-center gap-3">
        <button
          type="button"
          onClick={clear}
          disabled={sending || !hasInk}
          className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-[#111]/55 disabled:opacity-35"
        >
          <Eraser className="size-4" /> Limpar
        </button>
        <button
          type="button"
          disabled={sending || !hasInk}
          onClick={() => void send()}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#111] px-6 text-[14px] font-semibold text-white shadow-lg disabled:opacity-35"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : null} Enviar
        </button>
      </div>

      {error ? (
        <p className="absolute inset-x-0 bottom-24 text-center text-[12px] text-red-600/90">{error}</p>
      ) : null}
    </motion.div>,
    document.body
  )
}

/* ================================================================== */
/* Overlay mobile "padrão" (pad local escuro)                          */
/* ================================================================== */

function MobileSignatureContent({
  employeeName,
  amountLabel,
  saving,
  onClose,
  onConfirm
}: Omit<PaymentSignatureDialogProps, 'open'>) {
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    if (!signature) {
      setError('Peça para a pessoa desenhar a assinatura antes de confirmar.')
      return
    }
    setError(null)
    await onConfirm(signature)
  }

  return (
    <div className="flex h-full flex-col bg-[#111111] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[16px] text-[#F0EFEC]/90">Confirmação de recebimento</p>
          <p className="mt-0.5 text-[12px] text-[#F0EFEC]/40">Assine horizontalmente</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-[8px] p-2 text-[#F0EFEC]/55">
          <X className="size-4" />
        </button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4 rounded-[12px] border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
        <div>
          <p className="text-[11px] text-[#F0EFEC]/35">Recebedor</p>
          <p className="mt-0.5 truncate text-[14px] text-[#F0EFEC]/82">{employeeName}</p>
        </div>
        <div>
          <p className="text-[11px] text-[#F0EFEC]/35">Valor a receber</p>
          <p className="mt-0.5 text-[14px] text-[#F0EFEC]/82">{amountLabel}</p>
        </div>
      </div>
      <SignaturePad onReady={setSignature} />
      {error ? <p className="mt-2 text-[12px] text-red-300">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={!signature || saving}
          onClick={() => void submit()}
          className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111] disabled:opacity-40"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar pagamento
        </button>
      </div>
    </div>
  )
}

/* ================================================================== */
/* Export principal                                                    */
/* ================================================================== */

export function PaymentSignatureDialog(props: PaymentSignatureDialogProps) {
  const mobile = isMobileShell()

  useEffect(() => {
    if (!props.open || !mobile) return
    let active = true
    void import('@capacitor/screen-orientation')
      .then(async ({ ScreenOrientation }) => {
        if (active) await ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => undefined)
      })
      .catch(() => undefined)
    return () => {
      active = false
      void import('@capacitor/screen-orientation')
        .then(({ ScreenOrientation }) => ScreenOrientation.unlock())
        .catch(() => undefined)
    }
  }, [props.open, mobile])

  if (!props.open) return null
  if (!mobile) {
    return (
      <Dialog
        open
        title="Assinar recebimento"
        description="Assine no computador ou use a assinatura digital sincronizada com o celular."
        wide
        onClose={props.onClose}
      >
        <DesktopSignatureContent {...props} />
      </Dialog>
    )
  }
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[600] h-[100dvh] w-[100dvw] overflow-auto bg-[#111111]"
    >
      <MobileSignatureContent {...props} />
    </motion.div>,
    document.body
  )
}
