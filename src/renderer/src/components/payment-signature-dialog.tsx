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
  openCount: number
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
          linkedAt: session.linkedAt ?? null,
          openCount: session.openCount ?? 0
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

/**
 * Preview grande da assinatura recebida. Renderiza o MESMO PNG final que o
 * celular gerou (mesma espessura, mesmo recorte) — o que o PC mostra é
 * idêntico ao que vai no recibo, sem distorção nem tremedeira.
 */
function SyncPreviewCanvas({
  signatureUrl,
  strokes,
  aspect
}: {
  signatureUrl: string | null
  strokes: SignatureStrokePoint[]
  aspect: number
}) {
  // Fallback: sem PNG ainda (traços parciais), desenha os traços normalizados
  // com espessura relativa ao CANVAS (não à tela), mantendo a proporção real.
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawnCount = useRef(-1)

  useEffect(() => {
    if (signatureUrl || !canvasRef.current) return
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
    paintInkStrokes(ctx, mapped, Math.max(3, Math.min(bounds.width, bounds.height) * 0.011))
  }, [strokes, signatureUrl])

  if (signatureUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-[20px] border-[5px] border-[#0A0A0A] bg-white shadow-[0_10px_36px_rgba(0,0,0,0.45)]"
        style={{ width: 460, height: Math.round(460 / clampInkValue(aspect || 0.5, 0.3, 4)) }}
      >
        <img src={signatureUrl} alt="Assinatura" className="h-full w-full object-contain" />
      </div>
    )
  }

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
 * quando a assinatura chega (status signed), confirma. Sem vínculo, cai no
 * pad local. Abrir/fechar o modal manda sinal explícito para o celular
 * (open/close) — nunca desvincula.
 */
function DesktopSignatureContent({
  employeeName,
  amountLabel,
  saving,
  onConfirm
}: Omit<PaymentSignatureDialogProps, 'open'>) {
  const [link, setLink] = useState<SignatureLink | null>(() => getSignatureLink('pc'))
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'received' | 'confirmed'>('idle')
  const [strokes, setStrokes] = useState<SignatureStrokePoint[]>([])
  const [aspect, setAspect] = useState(2.2)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [localSignature, setLocalSignature] = useState<string | null>(null)
  const [autoConfirmed, setAutoConfirmed] = useState(false)
  const confirmedRef = useRef(false)
  const lastOpenRef = useRef<number | null>(null)

  useEffect(() => subscribeSignatureLink(() => setLink(getSignatureLink('pc'))), [])

  // Modal abriu com vínculo: manda o celular ABRIR a tela de assinatura.
  useEffect(() => {
    const code = link?.code
    if (!code) {
      lastOpenRef.current = null
      return
    }
    let stopped = false
    void operations()
      .openSignatureSession({ code, aspect: 2.2 })
      .then((session) => {
        if (stopped) return
        lastOpenRef.current = session.openCount
        setStrokes([])
        setSignatureUrl(null)
        setPhase('waiting')
      })
      .catch(() => {
        if (!stopped) setPhase('waiting')
      })
    return () => {
      stopped = true
    }
  }, [link?.code])

  // Poll: acompanha traços, assinatura enviada e novo sinal de abertura.
  useSignaturePoll(link?.code ?? null, 650, (snapshot) => {
    if (snapshot.status === 'expired') {
      clearSignatureLink('pc', snapshot.code)
      setLink(null)
      setPhase('idle')
      return
    }
    if (snapshot.status === 'cancelled') {
      clearSignatureLink('pc', snapshot.code)
      setLink(null)
      setPhase('idle')
      return
    }
    // Novo pagamento (sinal open): recomeça do zero.
    if (lastOpenRef.current !== null && snapshot.openCount > lastOpenRef.current) {
      lastOpenRef.current = snapshot.openCount
      setStrokes([])
      setSignatureUrl(null)
      setAutoConfirmed(false)
      confirmedRef.current = false
      setPhase('waiting')
    }
    if (lastOpenRef.current === null) lastOpenRef.current = snapshot.openCount
    setStrokes(snapshot.strokes)
    setAspect(snapshot.aspect)
    if (snapshot.status === 'signed') setPhase('received')
    if (snapshot.status === 'confirmed' && phase !== 'confirmed') setPhase('confirmed')
  })

  // Renderiza a assinatura recebida na MESMA geometria em que foi desenhada
  // (largura em pixels equivalente à tela do celular derivada do aspect) —
  // espessura e variação por velocidade idênticas ao que a pessoa desenhou.
  useEffect(() => {
    if (phase !== 'received' || signatureUrl) return
    if (strokes.length < 8) return
    try {
      const sourceWidth = Math.round(1080 * clampInkValue(aspect || 2.2, 0.3, 4))
      const url = signatureDataUrlFromNormalized(strokesFromFlat(strokes), aspect, sourceWidth)
      setSignatureUrl(url)
    } catch {
      // ainda desenhando
    }
  }, [phase, strokes, aspect, signatureUrl])

  const canConfirm = phase === 'received' && Boolean(signatureUrl) && !saving

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
      setPhase('confirmed')
      // Pagamento concluído: celular volta ao loader standby — vínculo 24h segue.
      void operations().closeSignatureSession({ code: link.code }).catch(() => undefined)
    } catch (confirmError) {
      confirmedRef.current = false
      setAutoConfirmed(false)
      setError(operationError(confirmError))
    }
  }

  // Limpeza: modal fechou sem confirmar → celular volta ao standby (o vínculo
  // permanece válido por 24h — NUNCA cancela a sessão aqui).
  useEffect(() => {
    const code = link?.code
    return () => {
      if (code && !confirmedRef.current) {
        void operations().closeSignatureSession({ code }).catch(() => undefined)
      }
    }
  }, [link?.code])

  const linked = Boolean(link)
  const received = phase === 'received' || phase === 'confirmed'

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
              <SyncPreviewCanvas signatureUrl={signatureUrl} strokes={strokes} aspect={aspect} />
              <div className="flex items-center gap-2 text-[12px] text-[#34D399]">
                <Check className="size-4" strokeWidth={2.5} />
                {autoConfirmed || phase === 'confirmed'
                  ? 'Assinatura confirmada! Pagamento concluído.'
                  : 'Assinatura recebida do celular.'}
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
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-[11px] text-[#F0EFEC]/30">
              Quer assinar pelo celular? Use o botão Assinatura digital no topo.
            </p>
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
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-[11px] text-[#F0EFEC]/28">Vínculo por {link ? hoursLeft(link.expiresAt) : 0}h</p>
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
    </div>
  )
}

/* ================================================================== */
/* Botão do header + MODAL de vínculo (só desktop). O celular GERA o    */
/* código; aqui o PC INSERE. Nada de painel dropdown que corta na       */
/* borda da janela — agora é um Dialog central de verdade.              */
/* ================================================================== */

export function SignatureLinkButton() {
  const mobile = isMobileShell()
  if (mobile) return null
  return <SignatureLinkButtonDesktop />
}

function SignatureLinkButtonDesktop() {
  const [link, setLocalLink] = useState<SignatureLink | null>(() => getSignatureLink('pc'))
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [justLinked, setJustLinked] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => subscribeSignatureLink(() => setLocalLink(getSignatureLink('pc'))), [])

  // Pareamento invertido (celular GERA, PC INSERE): enquanto o modal está
  // aberto com um código digitado, esperamos o celular aceitar o vínculo —
  // quando a sessão vira 'linked', o PC salva o mesmo código de 24h.
  useEffect(() => {
    if (!modalOpen || justLinked || link) return
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
              setModalOpen(false)
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
  }, [modalOpen, justLinked, link, codeInput])

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
        setModalOpen(false)
        setJustLinked(false)
      }, 2000)
    } catch (joinError) {
      setError(operationError(joinError))
    } finally {
      setConnecting(false)
    }
  }

  function openModal(): void {
    setError(null)
    setCodeInput('')
    setModalOpen(true)
  }

  function unlink(): void {
    const code = link?.code
    if (code) void operations().cancelSignatureSession({ code }).catch(() => undefined)
    clearSignatureLink('pc')
    setLocalLink(null)
    setModalOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={
          link
            ? `Celular vinculado (${hoursLeft(link.expiresAt)}h restantes). Clique para gerenciar.`
            : 'Vincular o celular para assinar digitalmente (dura 24h).'
        }
        className={link
          ? 'inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#34D399]/25 bg-[#34D399]/10 px-3 text-[12px] font-medium text-[#34D399] transition-colors'
          : 'inline-flex h-9 items-center gap-2 rounded-[9px] border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] font-medium text-[#F0EFEC]/70 transition-colors hover:text-[#F0EFEC]'}
      >
        <Smartphone className="size-3.5" />
        {link ? `Vinculado · ${hoursLeft(link.expiresAt)}h` : 'Assinatura digital'}
      </button>

      <Dialog
        open={modalOpen}
        title="Assinatura digital"
        description={
          link
            ? 'Celular vinculado — todo pagamento aberto no PC abre a assinatura direto no aparelho.'
            : 'Abra o app no celular, toque em Assinatura digital e digite aqui o código de 4 dígitos.'
        }
        onClose={() => setModalOpen(false)}
      >
        <div className="px-5 pb-5">
          {justLinked ? (
            <div className="flex flex-col items-center gap-2.5 py-6 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-[#34D399]/12 text-[#34D399]">
                <Check className="size-6" strokeWidth={2.5} />
              </span>
              <p className="text-[14px] font-medium text-[#34D399]">Celular conectado!</p>
              <p className="text-[12px] text-[#F0EFEC]/45">Vínculo válido por 24 horas.</p>
            </div>
          ) : link ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-[#34D399]/12 text-[#34D399]">
                <Smartphone className="size-6" strokeWidth={1.8} />
              </span>
              <p className="text-[14px] font-medium text-[#F0EFEC]/88">Celular vinculado</p>
              <p className="max-w-xs text-[12px] leading-relaxed text-[#F0EFEC]/45">
                Ao clicar em Pendente → Pago no PC, a tela de assinatura abre no celular na hora.
                Restam {hoursLeft(link.expiresAt)}h de vínculo.
              </p>
              <button
                type="button"
                onClick={unlink}
                className="mt-1 h-9 rounded-[9px] border border-red-500/25 px-4 text-[12px] font-medium text-red-300/90 hover:bg-red-500/10"
              >
                Desvincular
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
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
                className="h-14 w-full rounded-[12px] border border-white/[0.09] bg-white/[0.03] text-center text-[26px] font-semibold tracking-[0.35em] text-[#F0EFEC] outline-none placeholder:text-[#F0EFEC]/18 focus:border-[#F0EFEC]/25"
              />
              <button
                type="button"
                disabled={connecting || codeInput.replace(/\D/g, '').length !== 4}
                onClick={() => void submitCode()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-[#F0EFEC] text-[13px] font-medium text-[#111] disabled:opacity-40"
              >
                {connecting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Conectar
              </button>
              {error ? <p className="text-[12px] text-red-300/85">{error}</p> : null}
              <p className="text-center text-[11px] text-[#F0EFEC]/30">
                O vínculo dura 24h — sem parear de novo a cada pagamento.
              </p>
            </div>
          )}
        </div>
      </Dialog>
    </>
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
 * Tela INTEIRA branca para assinar com o dedo. A tinta aparece NA HORA (pintura
 * síncrona em PIXELS por segmento + rAF refinando) — o envio para o PC acontece
 * apenas quando a pessoa toca em ENVIAR.
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
  const strokesRef = useRef<InkPoint[][]>([])
  const resizeFrame = useRef<number | null>(null)

  /** Segmento desenhado na hora, em pixels (não normalizado). */
  const paintSegmentNow = (a: InkPoint, b: InkPoint) => {
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
    strokesRef.current = []
    setHasInk(false)
    setError(null)
    const observer = new ResizeObserver(() => {
      if (ink.drawing || resizeFrame.current !== null) return
      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = null
        ink.setup()
        // Reposiciona a tinta já desenhada no novo tamanho.
        ink.dirty = true
      })
    })
    if (ink.canvasRef.current) observer.observe(ink.canvasRef.current)
    return () => observer.disconnect()
  }, [ink])

  const localPoint = (clientX: number, clientY: number): PointerLocal | null => {
    const canvas = ink.canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      p: 0.62
    }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event.clientX, event.clientY)
    if (!point) return
    capturePointer(event)
    ink.current = [{ ...point, p: pressureOf(event) }]
    ink.drawing = true
    ink.last = { x: point.x, y: point.y }
    ink.dirty = true
    setHasInk(true)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawing) return
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const pointer of coalesced) {
      const point = localPoint(pointer.clientX, pointer.clientY)
      if (!point) continue
      if (ink.last && Math.hypot(point.x - ink.last.x, point.y - ink.last.y) < 1.1) continue
      const previous =
        ink.current.length > 0
          ? ink.current[ink.current.length - 1]
          : { ...point, p: pressureOf(pointer) }
      ink.current.push({ ...point, p: pressureOf(pointer) })
      // Tinta imediata em pixels: aparece mesmo se o rAF engasgar.
      paintSegmentNow(previous, { ...point, p: pressureOf(pointer) })
      ink.last = { x: point.x, y: point.y }
    }
    ink.dirty = true
  }

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ink.drawing) return
    ink.drawing = false
    ink.last = null
    if (ink.current.length > 0) {
      // O traço precisa MORAR no engine (ink.strokes): o loop rAF repinta
      // [...engine.strokes, engine.current] — sem isso, qualquer repaint
      // (resize/poll/re-render) apagava o desenho ao soltar o dedo.
      ink.strokes.push(ink.current)
      strokesRef.current.push(ink.current)
      ink.current = []
      setHasInk(true)
      ink.dirty = true
    }
    releasePointer(event)
  }

  // Limpar é a ÚNICA ação que apaga a assinatura (canvas + estado de envio).
  const clear = () => {
    ink.clear()
    strokesRef.current = []
    setHasInk(false)
  }

  async function send(): Promise<void> {
    if (sending || !hasInk) return
    setSending(true)
    setError(null)
    try {
      // Converte pixels → normalizado e envia TUDO agora, em lotes.
      const canvas = ink.canvasRef.current
      const bounds = canvas?.getBoundingClientRect()
      const width = Math.max(1, bounds?.width ?? 1)
      const height = Math.max(1, bounds?.height ?? 1)
      const aspect = width / height
      const flat: SignatureStrokePoint[] = []
      for (const stroke of strokesRef.current) {
        for (const point of stroke) {
          flat.push({
            x: Math.round((point.x / width) * 10000) / 10000,
            y: Math.round((point.y / height) * 10000) / 10000
          })
        }
        flat.push({ x: -1, y: -1, m: 1 })
      }
      if (flat.length === 0) throw new Error('Desenhe a assinatura antes de enviar.')
      // Envio em lotes SEM reset: a sessão já foi limpa pelo open do PC.
      // Um reset não-silent bumpava open_count e o celular remontava esta
      // tela no meio do envio (tela branca / "não existe assinatura").
      const batchCount = Math.ceil(flat.length / 400)
      for (let index = 0; index < batchCount; index += 1) {
        const batch = flat.slice(index * 400, (index + 1) * 400)
        await operations().pushSignatureStrokes({
          code,
          strokes: batch,
          aspect
        })
      }
      await operations().finishSignatureSession({ code })
      onSent()
    } catch (sendError) {
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
 *
 * O botão "Assinatura digital" da aba de vales abre este MESMO host em modo
 * pareamento (via evento), para não existirem dois hosts conflitando.
 */
const OPEN_PAIR_EVENT = 'flow-signature-open-pair'

/** Botão do header mobile: abre a tela do código de 4 dígitos. */
export function SignatureMobilePairButton() {
  if (!isMobileShell()) return null
  return (
    <button
      type="button"
      onClick={() => {
        try {
          window.dispatchEvent(new Event(OPEN_PAIR_EVENT))
        } catch {
          /* ignore */
        }
      }}
      title="Vincular este celular ao computador para assinar digitalmente"
      className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] font-medium text-[#F0EFEC]/70 transition-colors hover:text-[#F0EFEC]"
    >
      <Smartphone className="size-3.5" />
      Assinatura digital
    </button>
  )
}

export function SignatureMobileHost() {
  const [phase, setPhase] = useState<MobilePhase>('idle')
  const [link, setLocalLink] = useState<SignatureLink | null>(() => getSignatureLink('phone'))
  const [drawKey, setDrawKey] = useState<string>('')
  const [orientError, setOrientError] = useState(false)
  const openSeenRef = useRef(0)
  const tapSeenRef = useRef<string | null>(null)

  useEffect(() => subscribeSignatureLink(() => setLocalLink(getSignatureLink('phone'))), [])

  const closeAll = useCallback(() => setPhase('idle'), [])

  // Botão "Assinatura digital" da aba de vales: abre o pareamento neste host.
  useEffect(() => {
    const open = () => setPhase('pair')
    window.addEventListener(OPEN_PAIR_EVENT, open)
    return () => window.removeEventListener(OPEN_PAIR_EVENT, open)
  }, [])

  const unlink = useCallback(() => {
    const current = getSignatureLink('phone')
    if (current) void operations().cancelSignatureSession({ code: current.code }).catch(() => undefined)
    clearSignatureLink('phone')
    setLocalLink(null)
    openSeenRef.current = 0
    tapSeenRef.current = null
    setPhase('idle')
  }, [])

  // Standby: guarda os sinais atuais da sessão para só reagir a sinais NOVOS
  // (a tela de assinatura NUNCA abre sozinha ao entrar no app/parear).
  useEffect(() => {
    if (!link) {
      openSeenRef.current = 0
      tapSeenRef.current = null
      return
    }
    let cancelled = false
    void operations()
      .getSignatureSession({ code: link.code })
      .then((session) => {
        if (cancelled) return
        openSeenRef.current = session.openCount ?? 0
        tapSeenRef.current = session.linkedAt ?? null
        if (session.status === 'cancelled' || session.status === 'expired') {
          clearSignatureLink('phone', link.code)
          setLocalLink(null)
        } else {
          // Com vínculo ativo, o celular fica no loader standby (não sai
          // sozinho para a tela de vales — só o X do usuário fecha).
          setPhase((current) => (current === 'idle' ? 'wait' : current))
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [link?.code])

  // Poll contínuo enquanto houver vínculo. Dois sinais distintos:
  //  - openCount aumentou → PC mandou ABRIR a assinatura (novo pagamento);
  //  - linked_at mudou sem openCount → PC fechou a rodada (modal fechou ou
  //    confirmou) → volta ao loader standby. NUNCA desvincula.
  useSignaturePoll(link?.code ?? null, 1100, (snapshot) => {
    if (snapshot.status === 'cancelled' || snapshot.status === 'expired') {
      clearSignatureLink('phone', snapshot.code)
      setLocalLink(null)
      openSeenRef.current = 0
      tapSeenRef.current = null
      setPhase('pair')
      return
    }
    const open = snapshot.openCount ?? 0
    if (open > openSeenRef.current) {
      openSeenRef.current = open
      tapSeenRef.current = snapshot.linkedAt ?? null
      setDrawKey(`${snapshot.code}:${open}`)
      setPhase('draw')
      return
    }
    if (snapshot.linkedAt && snapshot.linkedAt !== tapSeenRef.current) {
      tapSeenRef.current = snapshot.linkedAt
      setPhase((current) => (current === 'draw' || current === 'waitConfirm' ? 'wait' : current))
      return
    }
    if (snapshot.status === 'confirmed') {
      setPhase((current) => (current === 'draw' || current === 'waitConfirm' ? 'wait' : current))
    }
  })

  // O loader standby fica ATÉ o PC pedir a próxima assinatura (ou a pessoa
  // fechar com o X) — nunca some sozinho para não “perder” o modo sync.

  // Se a confirmação no PC demorar demais, volta ao loader standby.
  useEffect(() => {
    if (phase !== 'waitConfirm') return
    const timer = window.setTimeout(() => setPhase('wait'), 30_000)
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
                Aguardando o próximo pagamento. Quando clicarem em Pendente → Pago no PC, a assinatura abre aqui.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[#F0EFEC]/38">
              <Loader2 className="size-3.5 animate-spin" />
              Em standby · vínculo por {hoursLeft(link?.expiresAt ?? Date.now())}h
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
            onSent={() => {
              openSeenRef.current = Math.max(openSeenRef.current, 0)
              setPhase('waitConfirm')
            }}
            onCancel={() => {
              // Volta ao loader standby — a rodada é liberada pelo PC quando
              // fechar o modal (o vínculo 24h segue intacto).
              setPhase('wait')
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
