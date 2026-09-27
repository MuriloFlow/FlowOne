import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Eraser, Loader2, PenLine, Smartphone, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog } from '@/components/ui/dialog'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { operations, operationError } from '@/lib/operations'
import {
  clampInkValue,
  paintInkStrokes,
  signatureDataUrlFromNormalized,
  strokesFromFlat,
  type InkPoint
} from '@/lib/signature-ink'
import {
  clearSignatureLink,
  getSignatureLink,
  hoursLeft,
  setSignatureLink,
  subscribeSignatureLink,
  type SignatureLink
} from '@/lib/signature-link'
import type { SignatureStrokePoint } from '../../../shared/operations'

/* ================================================================== */
/* Motor de canvas reutilizável (tinta nunca some, repaint em rAF)     */
/* ================================================================== */

type InkEngineOptions = {
  size: number
  background: string
}

type InkEngine = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  strokes: InkPoint[][]
  current: InkPoint[]
  dirty: boolean
  drawing: boolean
  last: { x: number; y: number } | null
  setup: () => void
  repaint: () => void
  clear: () => void
}

function createInkEngine(): InkEngine {
  return {
    canvasRef: { current: null },
    strokes: [],
    current: [],
    dirty: true,
    drawing: false,
    last: null,
    setup: () => undefined,
    repaint: () => undefined,
    clear: () => undefined
  }
}

function useInkEngine(options: InkEngineOptions) {
  const engine = useMemo<InkEngine>(() => createInkEngine(), [])
  const optionsRef = useRef(options)
  optionsRef.current = options
  const frameRef = useRef<number | null>(null)

  engine.setup = useCallback(() => {
    const canvas = engine.canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(bounds.width * scale))
    canvas.height = Math.max(1, Math.round(bounds.height * scale))
    engine.dirty = true
  }, [engine])

  engine.repaint = useCallback(() => {
    const canvas = engine.canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const bounds = canvas.getBoundingClientRect()
    const scale = canvas.width / Math.max(1, bounds.width)
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = optionsRef.current.background
    ctx.fillRect(0, 0, bounds.width, bounds.height)
    const all = engine.current.length ? [...engine.strokes, engine.current] : engine.strokes
    paintInkStrokes(ctx, all, optionsRef.current.size)
    ctx.restore()
  }, [engine])

  engine.clear = useCallback(() => {
    engine.strokes = []
    engine.current = []
    engine.dirty = true
  }, [engine])

  useEffect(() => {
    const loop = () => {
      if (engine.dirty) {
        engine.dirty = false
        engine.repaint()
      }
      frameRef.current = window.requestAnimationFrame(loop)
    }
    frameRef.current = window.requestAnimationFrame(loop)
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [engine])

  return engine
}

type PointerLocal = { x: number; y: number; p: number }

function localCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): PointerLocal {
  const rect = canvas.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top, p: 0.62 }
}

function pressureOf(pointer: PointerEvent | React.PointerEvent): number {
  const raw = (pointer as { pressure?: number }).pressure
  return raw && raw > 0 && raw < 1 ? raw : 0.62
}

function capturePointer(event: React.PointerEvent<HTMLCanvasElement>): void {
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    /* WebView pode recusar */
  }
}

function releasePointer(event: React.PointerEvent<HTMLCanvasElement>): void {
  try {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  } catch {
    /* já liberada */
  }
}

/* ================================================================== */
/* Pad local (desktop sem vínculo e mobile padrão)                     */
/* ================================================================== */

function SignaturePad({ onReady }: { onReady: (value: string | null) => void }) {
  const ink = useInkEngine({ size: 4.6, background: '#FFFFFF' })
  const resizeFrame = useRef<number | null>(null)

  useEffect(() => {
    ink.setup()
    const observer = new ResizeObserver(() => {
      if (ink.drawing || resizeFrame.current !== null) return
      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = null
        ink.setup()
      })
    })
    if (ink.canvasRef.current) observer.observe(ink.canvasRef.current)
    return () => observer.disconnect()
  }, [ink])

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ink.canvasRef.current
    if (!canvas) return
    capturePointer(event)
    const point = localCanvasPoint(canvas, event.clientX, event.clientY)
    ink.current = [{ ...point, p: pressureOf(event) }]
    ink.drawing = true
    ink.last = { x: point.x, y: point.y }
    ink.dirty = true
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawing) return
    const canvas = ink.canvasRef.current
    if (!canvas) return
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const pointer of coalesced) {
      const point = localCanvasPoint(canvas, pointer.clientX, pointer.clientY)
      if (ink.last && Math.hypot(point.x - ink.last.x, point.y - ink.last.y) < 1.1) continue
      ink.current.push({ ...point, p: pressureOf(pointer) })
      ink.last = { x: point.x, y: point.y }
    }
    ink.dirty = true
  }

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawing) return
    ink.drawing = false
    ink.last = null
    if (ink.current.length > 0) {
      ink.strokes.push(ink.current)
      ink.current = []
      ink.dirty = true
      const canvas = ink.canvasRef.current
      if (canvas) {
        // Exporta no mesmo pipeline do sync: PNG transparente, recortado na
        // tinta — o recibo nunca recebe um bloco branco.
        const bounds = canvas.getBoundingClientRect()
        const aspect = bounds.width / Math.max(1, bounds.height)
        const normalized = [...ink.strokes].map((stroke) =>
          stroke.map((point) => ({
            x: point.x / Math.max(1, bounds.width),
            y: point.y / Math.max(1, bounds.height),
            p: point.p
          }))
        )
        try {
          onReady(signatureDataUrlFromNormalized(normalized, aspect))
        } catch {
          onReady(null)
        }
      }
    }
    releasePointer(event)
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
        className="h-[240px] w-full touch-none cursor-crosshair overscroll-none select-none"
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
/* Hook compartilhado de polling da sessão sincronizada                */
/* ================================================================== */

type SyncSnapshot = {
  code: string
  status: string
  strokes: SignatureStrokePoint[]
  aspect: number
  linkedAt: string | null
}

function useSignaturePoll(code: string | null, intervalMs: number, onTick: (snapshot: SyncSnapshot) => void) {
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  useEffect(() => {
    if (!code) return
    let stopped = false
    const tick = async () => {
      if (stopped) return
      try {
        const session = await operations().getSignatureSession({ code })
        if (stopped) return
        onTickRef.current({
          code,
          status: session.status,
          strokes: session.strokes ?? [],
          aspect: session.aspect ?? 2.2,
          linkedAt: session.linkedAt ?? null
        })
      } catch {
        // rede instável: tenta no próximo tick
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), intervalMs)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [code, intervalMs])
}

/* ================================================================== */
/* Desktop — modal do pagamento                                        */
/* ================================================================== */

type PaymentSignatureDialogProps = {
  open: boolean
  employeeName: string
  amountLabel: string
  saving?: boolean
  onClose: () => void
  onConfirm: (signature: string) => Promise<void> | void
}

/** Preview grande da assinatura recebida (proporção real do celular). */
function SyncPreviewCanvas({ strokes, aspect }: { strokes: SignatureStrokePoint[]; aspect: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawnCount = useRef(-1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || strokes.length === drawnCount.current) return
    drawnCount.current = strokes.length
    const bounds = canvas.getBoundingClientRect()
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(bounds.width * scale))
    canvas.height = Math.max(1, Math.round(bounds.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, bounds.width, bounds.height)
    const mapped = strokesFromFlat(strokes).map((stroke) =>
      stroke.map((point) => ({ x: point.x * bounds.width, y: point.y * bounds.height, p: point.p }))
    )
    paintInkStrokes(ctx, mapped, (7 * bounds.width) / 1000)
  }, [strokes])

  // Retângulo largo (proporção real da tela do celular em landscape).
  const width = Math.min(460, 620 * clampInkValue(aspect || 0.5, 0.35, 1))
  const height = Math.round(width / clampInkValue(aspect || 0.5, 0.3, 4))
  return (
    <div
      className="relative overflow-hidden rounded-[20px] border-[5px] border-[#0A0A0A] bg-white shadow-[0_10px_36px_rgba(0,0,0,0.45)]"
      style={{ width, height }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}

/**
 * Modal do pagamento no PC. Com o celular vinculado (24h), mostra SOMENTE o
 * loader "Aguardando assinatura no celular…" e recebe os traços ao vivo;
 * quando a assinatura chega (status signed), confirma sozinho. Sem vínculo,
 * cai no pad local com o botão de conectar.
 */
function DesktopSignatureContent({
  employeeName,
  amountLabel,
  saving,
  onConfirm
}: Omit<PaymentSignatureDialogProps, 'open'>) {
  const [link, setLink] = useState<SignatureLink | null>(() => getSignatureLink('pc'))
  const [, setStatus] = useState<string>('linked')
  const [strokes, setStrokes] = useState<SignatureStrokePoint[]>([])
  const [aspect, setAspect] = useState(2.2)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [localSignature, setLocalSignature] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [autoConfirmed, setAutoConfirmed] = useState(false)
  const confirmedRef = useRef(false)
  const sessionRef = useRef<string | null>(null)

  useEffect(() => subscribeSignatureLink(() => setLink(getSignatureLink('pc'))), [])

  useEffect(() => {
    sessionRef.current = link?.code ?? null
    setStatus(link ? 'linked' : 'waiting')
    setStrokes([])
    setSignatureUrl(null)
    setAutoConfirmed(false)
    setError(null)
  }, [link?.code])

  const phoneSentRef = useRef(false)

  useSignaturePoll(link?.code ?? null, 650, (snapshot) => {
    setStatus(snapshot.status)
    setStrokes(snapshot.strokes)
    setAspect(snapshot.aspect)
    if (snapshot.status === 'signed') phoneSentRef.current = true
    if (snapshot.status === 'confirmed') phoneSentRef.current = false
    if (snapshot.status === 'cancelled') {
      clearSignatureLink('pc', snapshot.code)
      return
    }
    // Depois de confirmado, o PC já recoloca a sessão em prontidão para o
    // próximo pagamento — o celular volta ao modo aguardando.
    if (snapshot.status === 'confirmed' && sessionRef.current) {
      void operations()
        .pushSignatureStrokes({ code: snapshot.code, reset: true, silent: true })
        .catch(() => undefined)
    }
  })

  // Renderiza a assinatura recebida quando completa.
  useEffect(() => {
    if (!link || signatureUrl) return
    if (strokes.length < 8) return
    try {
      const url = signatureDataUrlFromNormalized(strokesFromFlat(strokes), aspect)
      setSignatureUrl(url)
    } catch {
      // ainda desenhando
    }
  }, [link, strokes, aspect, signatureUrl])

  // O botão "Confirmar pagamento" só liga depois do ENVIAR do celular
  // (status signed) com a assinatura já renderizada.
  const canConfirm = Boolean(link && signatureUrl && phoneSentRef.current && !saving && !autoConfirmed)

  async function confirmReceived(): Promise<void> {
    if (!link || !signatureUrl || confirmedRef.current) return
    confirmedRef.current = true
    setAutoConfirmed(true)
    try {
      try {
        await operations().confirmSignatureSession({ code: link.code })
      } catch {
        /* sessão pode já estar confirmada */
      }
      await onConfirm(signatureUrl)
    } catch (confirmError) {
      confirmedRef.current = false
      setAutoConfirmed(false)
      setError(operationError(confirmError))
    }
  }

  // Abertura do modal: "toca" a sessão para o celular abrir a tela branca
  // sozinha (com o vínculo de 24h ativo).
  useEffect(() => {
    const code = getSignatureLink('pc')?.code
    if (!code) return
    void operations()
      .pushSignatureStrokes({ code, aspect: 2.2 })
      .then(() => operations().pushSignatureStrokes({ code, reset: true, aspect: 2.2 }))
      .catch(() => undefined)
  }, [])

  // Limpeza: modal fechou sem confirmar → limpa os traços da sessão 24h
  // (o vínculo permanece; apenas libera para a próxima assinatura).
  useEffect(() => {
    return () => {
      const code = sessionRef.current
      if (code && !confirmedRef.current) {
        void operations()
          .pushSignatureStrokes({ code, reset: true, silent: true })
          .catch(() => undefined)
      }
    }
  }, [])

  async function connect(): Promise<void> {
    setConnecting(true)
    setError(null)
    try {
      // Gera uma sessão nova e já pareia com o celular em 2 toques.
      const session = await operations().createSignatureSession({ aspect: 2.2 })
      setSignatureLink('pc', session.code)
      setLink(getSignatureLink('pc'))
    } catch (connectError) {
      setError(operationError(connectError))
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect(): Promise<void> {
    const code = link?.code
    if (code) void operations().cancelSignatureSession({ code }).catch(() => undefined)
    clearSignatureLink('pc')
    setLink(null)
  }

  const linked = Boolean(link)
  const received = Boolean(link && signatureUrl)

  return (
    <div className="px-5 pb-5">
      <div className="mb-4 rounded-[12px] border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-[#F0EFEC]/35">Recebedor</p>
            <p className="mt-0.5 truncate text-[14px] text-[#F0EFEC]/82">{employeeName}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[#F0EFEC]/35">Valor</p>
            <p className="mt-0.5 text-[14px] text-[#F0EFEC]/82">{amountLabel}</p>
          </div>
        </div>
      </div>

      {linked ? (
        <div className="flex flex-col items-center gap-4 rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-4 py-6">
          {received ? (
            <>
              <SyncPreviewCanvas strokes={strokes} aspect={aspect} />
              <div className="flex items-center gap-2 text-[12px] text-[#34D399]">
                <Check className="size-4" strokeWidth={2.5} />
                {autoConfirmed ? 'Assinatura confirmada! Finalizando…' : 'Assinatura recebida do celular.'}
              </div>
            </>
          ) : (
            <>
              <div className="relative grid size-16 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#34D399]/10" />
                <span className="relative grid size-16 place-items-center rounded-full bg-[#34D399]/10 text-[#34D399]">
                  <Smartphone className="size-7" strokeWidth={1.5} />
                </span>
              </div>
              <Loader2 className="size-5 animate-spin text-[#F0EFEC]/55" />
              <div className="text-center">
                <p className="text-[14px] font-medium text-[#F0EFEC]/85">Aguardando assinatura no celular…</p>
                <p className="mt-1 text-[12px] text-[#F0EFEC]/40">
                  Peça para a pessoa assinar com o dedo e tocar em ENVIAR.
                </p>
              </div>
              {error ? <p className="text-[12px] text-red-300/85">{error}</p> : null}
            </>
          )}
        </div>
      ) : (
        <>
          <SignaturePad onReady={setLocalSignature} />
          {error ? <p className="mt-2 text-[12px] text-red-300">{error}</p> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={connecting}
              onClick={() => void connect()}
              className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-white/[0.09] px-3.5 text-[13px] text-[#F0EFEC]/70 hover:bg-white/[0.04] hover:text-[#F0EFEC] disabled:opacity-40"
            >
              {connecting ? <Loader2 className="size-4 animate-spin" /> : <Smartphone className="size-4" />}
              Assinatura digital
            </button>
            <button
              type="button"
              disabled={!localSignature || saving}
              onClick={() => localSignature && void onConfirm(localSignature)}
              className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111] disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar pagamento
            </button>
          </div>
        </>
      )}

      {linked ? (
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => void confirmReceived()}
            className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111] disabled:opacity-40"
          >
            {autoConfirmed ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar pagamento
          </button>
        </div>
      ) : null}

      {link ? (
        <p className="mt-3 text-center text-[11px] text-[#F0EFEC]/28">
          Celular vinculado por {hoursLeft(link.expiresAt)}h ·{' '}
          <button
            type="button"
            onClick={() => void disconnect()}
            className="underline decoration-[#F0EFEC]/25 underline-offset-2 hover:text-[#F0EFEC]/55"
          >
            desvincular
          </button>
        </p>
      ) : null}
    </div>
  )
}

/* ================================================================== */
/* Botão do header (só desktop) — conectar/gerenciar o vínculo 24h     */
/* No celular NÃO renderiza: o modo assinatura lá é o host fullscreen.  */
/* ================================================================== */

export function SignatureLinkButton() {
  const mobile = isMobileShell()
  if (mobile) return null
  return <SignatureLinkButtonDesktop />
}

function SignatureLinkButtonDesktop() {
  const [link, setLocalLink] = useState<SignatureLink | null>(() => getSignatureLink('pc'))
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [justLinked, setJustLinked] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => subscribeSignatureLink(() => setLocalLink(getSignatureLink('pc'))), [])

  // Pareamento invertido (celular GERA, PC INSERE): enquanto o painel está
  // aberto com um código digitado, esperamos o celular aceitar o vínculo —
  // quando a sessão vira 'linked', o PC salva o mesmo código de 24h.
  useEffect(() => {
    if (!panelOpen || justLinked || link) return
    const code = codeInput.replace(/\D/g, '')
    if (code.length !== 4) return
    let stopped = false
    const timer = window.setInterval(async () => {
      if (stopped) return
      try {
        const session = await operations().getSignatureSession({ code })
        if (stopped) return
        if (session.status === 'linked' || session.status === 'waiting') {
          // O celular já entrou (join vira linked). Salva o vínculo no PC.
          if (session.status === 'linked') {
            stopped = true
            setSignatureLink('pc', session.code)
            setLocalLink(getSignatureLink('pc'))
            setCodeInput('')
            setJustLinked(true)
            window.setTimeout(() => {
              setPanelOpen(false)
              setJustLinked(false)
            }, 2000)
          }
        } else if (session.status === 'expired' || session.status === 'cancelled') {
          stopped = true
          setError('Esse código expirou. Peça outro no celular.')
          setCodeInput('')
        }
      } catch {
        // rede: tenta no próximo tick
      }
    }, 800)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [panelOpen, justLinked, link, codeInput])

  async function submitCode(): Promise<void> {
    const code = codeInput.replace(/\D/g, '')
    if (code.length !== 4) {
      setError('Digite o código de 4 dígitos que aparece no celular.')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      // Valida na hora: join do PC confirma o pareamento e estende 24h.
      const session = await operations().joinSignatureSession({ code })
      setSignatureLink('pc', session.code)
      setLocalLink(getSignatureLink('pc'))
      setCodeInput('')
      setJustLinked(true)
      window.setTimeout(() => {
        setPanelOpen(false)
        setJustLinked(false)
      }, 2000)
    } catch (joinError) {
      setError(operationError(joinError))
    } finally {
      setConnecting(false)
    }
  }

  function toggle(): void {
    if (panelOpen) {
      setPanelOpen(false)
      return
    }
    setError(null)
    setCodeInput('')
    setPanelOpen(true)
  }

  function unlink(): void {
    const code = link?.code
    if (code) void operations().cancelSignatureSession({ code }).catch(() => undefined)
    clearSignatureLink('pc')
    setLocalLink(null)
    setPanelOpen(false)
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        title={
          link
            ? `Celular vinculado (${hoursLeft(link.expiresAt)}h restantes).`
            : 'Vincular o celular para assinar digitalmente (dura 24h).'
        }
        className={link
          ? 'inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#34D399]/25 bg-[#34D399]/10 px-3 text-[12px] font-medium text-[#34D399] transition-colors'
          : 'inline-flex h-9 items-center gap-2 rounded-[9px] border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] font-medium text-[#F0EFEC]/70 transition-colors hover:text-[#F0EFEC]'}
      >
        <Smartphone className="size-3.5" />
        {link ? `Celular · ${hoursLeft(link.expiresAt)}h` : 'Assinatura digital'}
      </button>

      {panelOpen ? (
        <div className="absolute top-full right-0 z-[500] mt-2 w-[260px] rounded-[14px] border border-white/[0.08] bg-[#1A1A1A] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.6)]">
          {justLinked ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <span className="grid size-9 place-items-center rounded-full bg-[#34D399]/12 text-[#34D399]">
                <Check className="size-5" strokeWidth={2.5} />
              </span>
              <p className="text-[13px] font-medium text-[#34D399]">Celular conectado!</p>
              <p className="text-[11px] text-[#F0EFEC]/40">Válido por 24h.</p>
            </div>
          ) : !link ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[12px] leading-relaxed text-[#F0EFEC]/55">
                Abra o app no celular e toque em <span className="text-[#F0EFEC]/85">Assinatura digital</span>.
                Digite aqui o código de 4 dígitos que aparecer lá.
              </p>
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={4}
                  value={codeInput}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 4)
                    setCodeInput(digits)
                    setError(null)
                    if (digits.length === 4) void submitCode()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitCode()
                  }}
                  placeholder="0000"
                  className="h-11 flex-1 rounded-[10px] border border-white/[0.09] bg-white/[0.03] text-center text-[20px] font-semibold tracking-[0.35em] text-[#F0EFEC] outline-none placeholder:text-[#F0EFEC]/18 focus:border-[#F0EFEC]/25"
                />
                <button
                  type="button"
                  disabled={connecting || codeInput.replace(/\D/g, '').length !== 4}
                  onClick={() => void submitCode()}
                  className="inline-flex h-11 items-center rounded-[10px] bg-[#F0EFEC] px-3.5 text-[12px] font-medium text-[#111] disabled:opacity-40"
                >
                  {connecting ? <Loader2 className="size-4 animate-spin" /> : 'Conectar'}
                </button>
              </div>
              {error ? <p className="text-[11px] text-red-300/85">{error}</p> : null}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5 text-center">
              <span className="grid size-9 place-items-center rounded-full bg-[#34D399]/12 text-[#34D399]">
                <Smartphone className="size-5" strokeWidth={1.8} />
              </span>
              <p className="text-[13px] font-medium text-[#F0EFEC]/85">Celular vinculado</p>
              <p className="text-[11px] text-[#F0EFEC]/40">
                Pagamentos abrem a assinatura direto no aparelho. Restam {hoursLeft(link.expiresAt)}h.
              </p>
              <button
                type="button"
                onClick={unlink}
                className="mt-1 h-8 rounded-[8px] border border-red-500/20 px-3 text-[12px] text-red-300/85 hover:bg-red-500/10"
              >
                Desvincular
              </button>
            </div>
          )}
        </div>
      ) : null}

      {error && !panelOpen ? (
        <span className="absolute top-full right-0 z-50 mt-1 rounded-[8px] border border-red-500/20 bg-[#1A1A1A] px-2 py-1 text-[11px] whitespace-nowrap text-red-300/85">
          {error}
        </span>
      ) : null}
    </span>
  )
}

/* ================================================================== */
/* Mobile — host global: parear, aguardar pagamento, assinar, esperar   */
/* ================================================================== */

type MobilePhase = 'idle' | 'pair' | 'wait' | 'draw' | 'waitConfirm'

function MobilePairScreen({
  link,
  onPaired,
  onClose,
  onUnlink
}: {
  link: SignatureLink | null
  onPaired: (code: string) => void
  onClose: () => void
  onUnlink: () => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // O CELULAR gera e exibe o código; o PC é quem insere. A sessão nasce
  // 'waiting' e o PC faz join com esse código para vincular (24h).
  const createSession = useCallback(async () => {
    setCreating(true)
    setError(null)
    try {
      const session = await operations().createSignatureSession({ aspect: 2.2 })
      setCode(session.code)
    } catch (createError) {
      setError(operationError(createError))
    } finally {
      setCreating(false)
    }
  }, [])

  useEffect(() => {
    void createSession()
  }, [createSession])

  // Quando o PC fizer join (status → linked), salva o vínculo no celular.
  useEffect(() => {
    if (!code) return
    let stopped = false
    const timer = window.setInterval(async () => {
      if (stopped) return
      try {
        const session = await operations().getSignatureSession({ code })
        if (stopped) return
        if (session.status === 'linked') {
          stopped = true
          setSignatureLink('phone', code)
          onPaired(code)
        } else if (session.status === 'cancelled' || session.status === 'expired') {
          stopped = true
          setError('O computador cancelou. Toque para gerar outro código.')
          setCode(null)
        }
      } catch {
        // rede: tenta no próximo tick
      }
    }, 900)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [code, onPaired])

  return (
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
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-10 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-[#34D399]/10 text-[#34D399]">
          <Smartphone className="size-7" strokeWidth={1.6} />
        </div>
        <p className="max-w-xs text-[13px] leading-relaxed text-[#F0EFEC]/50">
          No computador, clique em <span className="text-[#F0EFEC]/80">Assinatura digital</span> e digite
          este código:
        </p>
        {creating || !code ? (
          <Loader2 className="size-6 animate-spin text-[#F0EFEC]/40" />
        ) : (
          <p className="text-[56px] leading-none font-semibold tracking-[0.3em] text-[#F0EFEC] tabular-nums">
            {code}
          </p>
        )}
        <div className="flex items-center gap-2 text-[12px] text-[#F0EFEC]/38">
          <Loader2 className="size-3.5 animate-spin" /> Aguardando o computador conectar…
        </div>
        {error ? (
          <>
            <p className="text-[12px] text-red-300/85">{error}</p>
            <button
              type="button"
              onClick={() => void createSession()}
              className="inline-flex h-10 items-center rounded-[10px] bg-[#F0EFEC] px-4 text-[13px] font-medium text-[#111]"
            >
              Gerar novo código
            </button>
          </>
        ) : null}
        {link ? (
          <button
            type="button"
            onClick={onUnlink}
            className="text-[12px] text-[#F0EFEC]/40 underline decoration-[#F0EFEC]/20 underline-offset-2"
          >
            Remover vínculo atual ({hoursLeft(link.expiresAt)}h)
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Tela INTEIRA branca para assinar com o dedo, envio em tempo real.
 * A tinta é pintada SINCRONAMENTE no pointermove (rAF só refina) — em WebView
 * Android sob carga o rAF pode demorar; sem isso a tinta "não sai".
 */
function MobileDrawScreen({
  code,
  onSent,
  onCancel
}: {
  code: string
  onSent: () => void
  onCancel: () => void
}) {
  const ink = useInkEngine({ size: 6.5, background: '#FFFFFF' })
  const [hasInk, setHasInk] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef<SignatureStrokePoint[]>([])
  const pushingRef = useRef(false)
  const doneRef = useRef(false)
  const resizeFrame = useRef<number | null>(null)

  /** Segmento desenhado na hora, sem esperar o rAF. */
  const paintSegmentNow = (a: { x: number; y: number; p: number }, b: { x: number; y: number; p: number }) => {
    const canvas = ink.canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const bounds = canvas.getBoundingClientRect()
    const scale = canvas.width / Math.max(1, bounds.width)
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    paintInkStrokes(ctx, [[a, b]], 6.5)
    ctx.restore()
  }

  useEffect(() => {
    ink.setup()
    ink.clear()
    pendingRef.current = []
    doneRef.current = false
    pushingRef.current = false
    setHasInk(false)
    setError(null)
    const observer = new ResizeObserver(() => {
      if (ink.drawing || resizeFrame.current !== null) return
      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = null
        ink.setup()
      })
    })
    if (ink.canvasRef.current) observer.observe(ink.canvasRef.current)
    return () => observer.disconnect()
  }, [ink])

  // Envio em tempo real: lotes a cada 120ms.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (pushingRef.current || pendingRef.current.length === 0 || doneRef.current) return
      const batch = pendingRef.current
      pendingRef.current = []
      pushingRef.current = true
      try {
        await operations().pushSignatureStrokes({ code, strokes: batch })
      } catch {
        pendingRef.current = [...batch, ...pendingRef.current]
      } finally {
        pushingRef.current = false
      }
    }, 120)
    return () => window.clearInterval(timer)
  }, [code])

  const normalizedPoint = (clientX: number, clientY: number): PointerLocal | null => {
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
    capturePointer(event)
    ink.current = [{ ...point, p: pressureOf(event) }]
    ink.drawing = true
    ink.last = { x: point.x, y: point.y }
    ink.dirty = true
    setHasInk(true)
    pendingRef.current.push({ x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000 })
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawing) return
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const pointer of coalesced) {
      const point = normalizedPoint(pointer.clientX, pointer.clientY)
      if (!point) continue
      if (ink.last && Math.hypot(point.x - ink.last.x, point.y - ink.last.y) < 0.0012) continue
      const previous = { ...point, p: ink.current.length ? ink.current[ink.current.length - 1].p : 0.62 }
      ink.current.push({ ...point, p: pressureOf(pointer) })
      // Tinta imediata: o Android não espera o próximo frame pra mostrar.
      paintSegmentNow(previous, { ...point, p: pressureOf(pointer) })
      ink.last = { x: point.x, y: point.y }
      pendingRef.current.push({ x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000 })
    }
    ink.dirty = true
  }

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawing) return
    ink.drawing = false
    ink.last = null
    if (ink.current.length > 0) {
      ink.strokes.push(ink.current)
      ink.current = []
      setHasInk(true)
      ink.dirty = true
      pendingRef.current.push({ x: -1, y: -1, m: 1 })
    }
    releasePointer(event)
  }

  const clear = () => {
    ink.clear()
    pendingRef.current = [{ x: -1, y: -1, m: 1 }]
    setHasInk(false)
    void operations().pushSignatureStrokes({ code, reset: true }).catch(() => undefined)
  }

  async function send(): Promise<void> {
    if (sending) return
    setSending(true)
    setError(null)
    try {
      doneRef.current = true
      for (let i = 0; i < 18 && pendingRef.current.length > 0; i += 1) {
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

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[740] h-[100dvh] w-[100dvw] overflow-hidden bg-white"
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

      <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top,0px)+12px)] left-4">
        <span className="inline-flex items-center rounded-full border border-[#111]/15 bg-white/85 px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] text-[#111]/70 uppercase">
          Assine
        </span>
      </div>

      <button
        type="button"
        onClick={() => void onCancel()}
        className="absolute top-[calc(env(safe-area-inset-top,0px)+8px)] right-3.5 z-10 grid size-10 place-items-center rounded-full text-[#111]/55 hover:bg-[#111]/5"
        aria-label="Cancelar assinatura"
      >
        <X className="size-5" />
      </button>

      {!hasInk && !sending ? (
        <p className="pointer-events-none absolute inset-x-0 top-[45%] text-center text-[16px] font-medium text-[#111]/25">
          Assine com o dedo
        </p>
      ) : null}

      <div className="absolute right-5 bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] z-10 flex items-center gap-3">
        <button
          type="button"
          onClick={clear}
          disabled={sending || !hasInk}
          className="inline-flex h-12 items-center gap-2 rounded-full border border-[#111]/10 bg-white/90 px-5 text-[13px] font-medium text-[#111]/60 shadow-sm disabled:opacity-35"
        >
          <Eraser className="size-4" /> Limpar
        </button>
        <button
          type="button"
          disabled={sending || !hasInk}
          onClick={() => void send()}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-[#111] px-7 text-[14px] font-semibold text-white shadow-lg disabled:opacity-35"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : null} Enviar
        </button>
      </div>

      {error ? (
        <p className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] text-center text-[12px] text-red-600/90">
          {error}
        </p>
      ) : null}
    </motion.div>,
    document.body
  )
}

/**
 * Host global do celular (montado fora do Shell). Pareia uma vez e fica
 * armado por 24h: sempre que o PC "toa" a sessão (novo pagamento), a tela
 * branca de assinatura abre sozinha — inclusive com o app em segundo plano.
 */
export function SignatureMobileHost() {
  const [phase, setPhase] = useState<MobilePhase>('idle')
  const [link, setLocalLink] = useState<SignatureLink | null>(() => getSignatureLink('phone'))
  const [drawKey, setDrawKey] = useState<string>('')
  const [orientError, setOrientError] = useState(false)
  const armedRef = useRef<string | null>(null)

  useEffect(() => subscribeSignatureLink(() => setLocalLink(getSignatureLink('phone'))), [])

  const closeAll = useCallback(() => setPhase('idle'), [])

  const unlink = useCallback(() => {
    const current = getSignatureLink('phone')
    if (current) void operations().cancelSignatureSession({ code: current.code }).catch(() => undefined)
    clearSignatureLink('phone')
    setLocalLink(null)
    armedRef.current = null
    setPhase('idle')
  }, [])

  // Inicializa o "armamento" com o linked_at atual para não reagir a toques
  // antigos quando o app abre.
  useEffect(() => {
    if (!link) {
      armedRef.current = null
      return
    }
    let cancelled = false
    void operations()
      .getSignatureSession({ code: link.code })
      .then((session) => {
        if (cancelled) return
        armedRef.current = session.linkedAt ?? null
        if (session.status === 'cancelled' || session.status === 'expired') {
          clearSignatureLink('phone', link.code)
          setLocalLink(null)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [link?.code])

  // Poll contínuo enquanto houver vínculo: detecta o toque do PC (novo
  // pagamento), cancelamentos e confirmações.
  useSignaturePoll(
    link?.code ?? null,
    1100,
    (snapshot) => {
      if (snapshot.status === 'cancelled' || snapshot.status === 'expired') {
        clearSignatureLink('phone', snapshot.code)
        setLocalLink(null)
        armedRef.current = null
        setPhase('pair')
        return
      }
      const tap = snapshot.linkedAt ?? null
      if (tap && tap !== armedRef.current) {
        if (snapshot.status === 'linked' && snapshot.strokes.length === 0) {
          // Novo pagamento: abre a tela branca (reinicia se já estiver nela).
          armedRef.current = tap
          setDrawKey(tap)
          setPhase('draw')
          return
        }
        // Toque antigo/já consumido — só atualiza o marcador.
        armedRef.current = tap
      }
      if (phase === 'waitConfirm' && snapshot.status === 'confirmed') {
        // PC confirmou → volta ao modo armado aguardando o próximo pagamento.
        setPhase('idle')
      }
    }
  )

  // A tela de "vinculado, aguardando" se dispensa sozinha — o host continua
  // armado em segundo plano e a assinatura abre quando o PC toar.
  useEffect(() => {
    if (phase !== 'wait') return
    const timer = window.setTimeout(() => setPhase('idle'), 4000)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Se a confirmação no PC demorar demais, volta ao estado armado.
  useEffect(() => {
    if (phase !== 'waitConfirm') return
    const timer = window.setTimeout(() => setPhase('idle'), 30_000)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Rotação: trava em landscape durante o desenho (com fallback para unlock).
  useEffect(() => {
    if (phase !== 'draw') return
    let active = true
    void import('@capacitor/screen-orientation')
      .then(async ({ ScreenOrientation }) => {
        if (!active) return
        try {
          await ScreenOrientation.lock({ orientation: 'landscape' })
        } catch {
          setOrientError(true)
        }
      })
      .catch(() => setOrientError(true))
    return () => {
      active = false
      void import('@capacitor/screen-orientation')
        .then(({ ScreenOrientation }) => ScreenOrientation.unlock().catch(() => undefined))
        .catch(() => undefined)
    }
  }, [phase])

  // Fullscreen REAL: esconde todo o app atrás do overlay (a UI por baixo
  // ficava clicável e atrapalhava X/Limpar/Enviar).
  useEffect(() => {
    if (phase === 'draw') {
      document.documentElement.classList.add('flow-signature-active')
    } else {
      document.documentElement.classList.remove('flow-signature-active')
    }
    return () => document.documentElement.classList.remove('flow-signature-active')
  }, [phase])

  if (phase === 'idle') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[700] h-[100dvh] w-[100dvw] overflow-hidden bg-[#111111]"
      >
        {phase === 'pair' ? (
          <MobilePairScreen
            link={link}
            onPaired={() => setPhase('wait')}
            onClose={closeAll}
            onUnlink={unlink}
          />
        ) : null}

        {phase === 'wait' ? (
          <div className="relative flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
            <button
              type="button"
              onClick={closeAll}
              className="absolute top-[calc(env(safe-area-inset-top,0px)+8px)] right-3.5 rounded-[8px] p-2 text-[#F0EFEC]/55 hover:bg-white/[0.05]"
              aria-label="Sair do modo de sincronização"
            >
              <X className="size-4" />
            </button>
            <div className="relative grid size-16 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#34D399]/10" />
              <span className="relative grid size-16 place-items-center rounded-full bg-[#34D399]/10 text-[#34D399]">
                <Smartphone className="size-7" strokeWidth={1.5} />
              </span>
            </div>
            <div>
              <p className="text-[15px] font-medium text-[#F0EFEC]/85">Vinculado ao computador</p>
              <p className="mt-1 text-[12px] text-[#F0EFEC]/40">
                Quando abrirem um pagamento no PC, a tela de assinatura abre aqui sozinha.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[#F0EFEC]/38">
              <Loader2 className="size-3.5 animate-spin" />
              Aguardando pagamento… ({hoursLeft(link?.expiresAt ?? Date.now())}h de vínculo)
            </div>
            {orientError ? (
              <p className="text-[11px] text-amber-200/60">Gire o celular para assinar melhor.</p>
            ) : null}
          </div>
        ) : null}

        {phase === 'draw' && link ? (
          <MobileDrawScreen
            key={drawKey || link.code}
            code={link.code}
            onSent={() => setPhase('waitConfirm')}
            onCancel={async () => {
              // Cancelar só esta rodada: sessão 24h continua válida para o
              // próximo pagamento (não desvincula o celular do PC).
              await operations()
                .pushSignatureStrokes({ code: link.code, reset: true, silent: true })
                .catch(() => undefined)
              setPhase('idle')
            }}
          />
        ) : null}

        {phase === 'waitConfirm' ? (
          <div className="relative flex h-full flex-col items-center justify-center gap-4">
            <button
              type="button"
              onClick={closeAll}
              className="absolute top-[calc(env(safe-area-inset-top,0px)+8px)] right-3.5 rounded-[8px] p-2 text-[#F0EFEC]/55 hover:bg-white/[0.05]"
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

/* ================================================================== */
/* Modal principal do pagamento (mobile + desktop)                     */
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

export function PaymentSignatureDialog(props: PaymentSignatureDialogProps) {
  const mobile = isMobileShell()

  if (!props.open) return null
  if (!mobile) {
    return (
      <Dialog
        open
        title="Assinar recebimento"
        description={
          getSignatureLink('pc')
            ? 'Celular vinculado — a assinatura será feita no aparelho.'
            : 'Assine no computador ou conecte o celular para assinar com o dedo.'
        }
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
