import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, History, Paperclip, PanelRight, Plus, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import iaMark from '@/assets/chat/ia.png'
import sendMark from '@/assets/chat/send.png'
import penaIcon from '@/assets/chat/Pena.svg'
import cartaoIcon from '@/assets/chat/Cartao.svg'
import globoIcon from '@/assets/chat/Globo.svg'
import userIcon from '@/assets/chat/User.svg'
import { ChatMarkdown } from '@/components/chat-markdown'
import { KobbiMiniChart } from '@/components/kobbi-mini-chart'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { useKobbi, type ChatMessage } from '@/lib/kobbi'
import { cn } from '@/lib/utils'
import { KOBBI_WIDTH_DEFAULT, KOBBI_WIDTH_MAX, KOBBI_WIDTH_MIN, type KobbiAttachment, type KobbiRatingValue, type KobbiThread } from '../../../shared/kobbi'

type KobbiDockProps = {
  open: boolean
  storeId: string | null
  userName: string
  userRole: string
  onClose: () => void
}

const SUGGESTIONS = [
  { label: 'Quais vales pendentes?', icon: penaIcon },
  { label: 'Quantos cartões hoje?', icon: cartaoIcon },
  { label: 'Qual loja lidera?', icon: globoIcon },
  { label: 'Como está a equipe?', icon: userIcon }
] as const

const ease = [0.22, 1, 0.36, 1] as const

export function KobbiFab({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.86, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.86, y: 10 }}
      transition={{ duration: 0.28, ease }}
      className="group pointer-events-none absolute right-4 bottom-4 z-10 size-[68px]"
    >
      <img
        src={iaMark}
        alt=""
        className="size-full object-contain drop-shadow-[0_12px_24px_rgba(122,178,255,0.28)] transition-transform duration-300 group-hover:scale-[1.06]"
      />
      <button
        type="button"
        aria-label="Abrir Kobbi"
        onClick={onOpen}
        className="pointer-events-auto absolute inset-0 m-auto size-11 rounded-full transition-transform duration-300 hover:scale-105"
      />
    </motion.div>
  )
}

export function KobbiDock({ open, storeId, userName, userRole, onClose }: KobbiDockProps) {
  const chat = useKobbi(storeId, userName, userRole)
  const mobile = isMobileShell()
  const [width, setWidth] = useState(KOBBI_WIDTH_DEFAULT)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const widthRef = useRef(width)
  widthRef.current = width
  const frame = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<KobbiAttachment | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  async function closeDock(): Promise<void> {
    setHistoryOpen(false)
    await chat.archiveIfNeeded()
    onClose()
  }

  async function toggleHistory(): Promise<void> {
    if (historyOpen) {
      setHistoryOpen(false)
      return
    }
    await chat.openHistory()
    setHistoryOpen(true)
  }

  useEffect(() => {
    void window.flow?.kobbi?.getWidth().then(setWidth)
  }, [])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 280)
  }, [open])

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [chat.messages, chat.busy])

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!drag.current || !frame.current) return
      const parent = frame.current?.parentElement
      const max = Math.min(KOBBI_WIDTH_MAX, Math.round((parent?.clientWidth ?? 1200) * 0.72))
      const next = Math.min(max, Math.max(KOBBI_WIDTH_MIN, drag.current.startWidth + (drag.current.startX - event.clientX)))
      widthRef.current = next
      setWidth(next)
    }
    function onUp() {
      if (!drag.current) return
      drag.current = null
      document.body.style.cursor = ''
      void window.flow?.kobbi?.setWidth(widthRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return (
    <>
      <motion.aside
        ref={frame}
        initial={false}
        animate={
          mobile
            ? { width: open ? '100%' : 0, opacity: open ? 1 : 0 }
            : { width: open ? width : 0, opacity: open ? 1 : 0 }
        }
        transition={{ type: 'spring', stiffness: 340, damping: 36, mass: 0.72 }}
        className={cn(
          'relative h-full shrink-0 overflow-hidden',
          open && !mobile && 'ml-1',
          mobile && open && 'absolute inset-0 z-30'
        )}
      >
          <div
            style={{ width: mobile ? '100%' : width }}
            className="absolute inset-y-0 right-0 flex h-full flex-col overflow-hidden rounded-[18px] bg-[#111111]"
          >
          {mobile ? null : (
          <button
            type="button"
            aria-label="Redimensionar Kobbi"
            onPointerDown={(event) => {
              event.preventDefault()
              drag.current = { startX: event.clientX, startWidth: width }
              document.body.style.cursor = 'col-resize'
            }}
            className="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize"
          />
          )}

          <div className="absolute top-4 right-4 z-10 flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Histórico do Kobbi"
              onClick={() => void toggleHistory()}
              className={cn(
                'flex size-8 items-center justify-center rounded-[8px] transition-colors',
                historyOpen
                  ? 'bg-white/[0.06] text-[#F0EFEC]/70'
                  : 'text-[#F0EFEC]/28 hover:bg-white/[0.04] hover:text-[#F0EFEC]/55'
              )}
            >
              <History className="size-4" strokeWidth={1.7} />
            </button>
            <button
              type="button"
              aria-label="Fechar Kobbi"
              onClick={() => void closeDock()}
              className="flex size-8 items-center justify-center rounded-[8px] text-[#F0EFEC]/28 transition-colors hover:bg-white/[0.04] hover:text-[#F0EFEC]/55"
            >
              <PanelRight className="size-4" strokeWidth={1.7} />
            </button>
          </div>

          {historyOpen ? (
            <HistoryPanel
              threads={chat.threads}
              onNew={() => {
                void chat.newChat().then(() => setHistoryOpen(false))
              }}
              onSelect={(thread) => {
                void chat.loadThread(thread).then(() => setHistoryOpen(false))
              }}
            />
          ) : chat.messages.length === 0 ? (
            <EmptyState
              onPick={(label) => {
                chat.fill(label)
                window.setTimeout(() => inputRef.current?.focus(), 20)
              }}
            />
          ) : (
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6 pt-14 pb-4">
              <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
                {chat.messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, ease }}
                    className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    {message.role === 'assistant' ? (
                      <AssistantBubble message={message} onRate={(rating) => void chat.rate(message.id, rating)} />
                    ) : (
                      <div className="flex max-w-[82%] flex-col items-end gap-1.5">
                        {message.attachments?.some((file) => file.mime.startsWith('image/')) ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {message.attachments
                              .filter((file) => file.mime.startsWith('image/'))
                              .map((file) => (
                                <button
                                  key={file.name}
                                  type="button"
                                  onClick={() => setPreview(file)}
                                  className="overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#1C1C1C]"
                                >
                                  <img
                                    src={file.dataUrl}
                                    alt={file.name}
                                    className="h-16 w-16 object-cover"
                                  />
                                </button>
                              ))}
                          </div>
                        ) : null}
                        {message.content ? (
                          <div className="rounded-[16px] bg-[#1C1C1C] px-3.5 py-2.5">
                            <ChatMarkdown text={message.content} className="kobbi-md-user" />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {historyOpen ? null : (
            <div className="shrink-0 px-5 pb-5">
              {chat.error ? (
                <p className="mb-2 px-1 text-[12px] text-red-300/75">{chat.error}</p>
              ) : null}
              <Composer
                draft={chat.draft}
                busy={chat.busy}
                inputRef={inputRef}
                attachments={chat.attachments}
                onDraft={chat.setDraft}
                onSend={() => void chat.send()}
                onFiles={(files) => void chat.addFiles(files)}
                onRemoveFile={chat.removeAttachment}
              />
            </div>
          )}
        </div>
      </motion.aside>
      <ImagePreview attachment={preview} onClose={() => setPreview(null)} />
    </>
  )
}

function AssistantBubble({
  message,
  onRate
}: {
  message: ChatMessage
  onRate: (rating: KobbiRatingValue) => void
}) {
  return (
    <div className="max-w-[92%]">
      {message.generating && !message.content ? (
        <p className="kobbi-shimmer text-[14px] font-medium">Gerando resposta....</p>
      ) : (
        <>
          <ChatMarkdown text={message.content} streaming={Boolean(message.generating)} />
          {message.chart && !message.generating ? <KobbiMiniChart spec={message.chart} /> : null}
          {!message.generating && message.content ? (
            <MessageActions text={message.content} rating={message.rating} onRate={onRate} />
          ) : null}
        </>
      )}
    </div>
  )
}

function MessageActions({
  text,
  rating,
  onRate
}: {
  text: string
  rating?: KobbiRatingValue | null
  onRate: (rating: KobbiRatingValue) => void
}) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard pode estar bloqueado */
    }
  }

  return (
    <div className="relative mt-2 flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-7 items-center gap-1.5 rounded-[8px] px-1.5 text-[11px] text-[#F0EFEC]/32 transition-colors hover:bg-white/[0.04] hover:text-[#F0EFEC]/62"
      >
        <Copy className="size-3.5" strokeWidth={1.7} />
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-[8px] px-1.5 text-[11px] transition-colors hover:bg-white/[0.04] hover:text-[#F0EFEC]/62',
          rating ? 'text-[#F0EFEC]/55' : 'text-[#F0EFEC]/32'
        )}
      >
        {rating === 'bad' ? (
          <ThumbsDown className="size-3.5" strokeWidth={1.7} />
        ) : (
          <ThumbsUp className="size-3.5" strokeWidth={1.7} />
        )}
        Avaliar
      </button>
      {open ? (
        <div className="absolute top-8 left-16 z-20 min-w-[168px] overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#1C1C1C] py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <button
            type="button"
            onClick={() => {
              onRate('good')
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#F0EFEC]/72 hover:bg-white/[0.04]',
              rating === 'good' && 'text-[#F0EFEC]/90'
            )}
          >
            <ThumbsUp className="size-3.5" strokeWidth={1.7} />
            Boa resposta
          </button>
          <button
            type="button"
            onClick={() => {
              onRate('bad')
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#F0EFEC]/72 hover:bg-white/[0.04]',
              rating === 'bad' && 'text-[#F0EFEC]/90'
            )}
          >
            <ThumbsDown className="size-3.5" strokeWidth={1.7} />
            Resposta ruim
          </button>
        </div>
      ) : null}
    </div>
  )
}

function HistoryPanel({
  threads,
  onNew,
  onSelect
}: {
  threads: KobbiThread[]
  onNew: () => void
  onSelect: (thread: KobbiThread) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-14 pb-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[13px] text-[#F0EFEC]/55">Conversas recentes</h2>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.06] px-2.5 text-[11px] text-[#F0EFEC]/55 transition-colors hover:bg-white/[0.04] hover:text-[#F0EFEC]/75"
        >
          <Plus className="size-3.5" strokeWidth={1.7} />
          Novo chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="px-1 pt-8 text-center text-[13px] text-[#F0EFEC]/32">
            As últimas 5 conversas deste usuário aparecem aqui.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelect(thread)}
                className="rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <p className="truncate text-[13px] text-[#F0EFEC]/78">{thread.title}</p>
                <p className="mt-0.5 text-[11px] text-[#F0EFEC]/32">{formatThreadWhen(thread.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatThreadWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function EmptyState({ onPick }: { onPick: (label: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease }}
        className="flex flex-col items-center text-center"
      >
        <img src={iaMark} alt="" className="mb-6 h-[118px] w-[118px] object-contain" />
        <h1 className="text-[28px] leading-none tracking-tight text-[#F0EFEC]/90">Como posso ajudar?</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[#F0EFEC]/38">
          Pergunte ao kobbi, por exemplo
          <br />
          “Me fala o relatório de julho”
        </p>
        <div className="mt-5 flex max-w-[420px] flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onPick(item.label)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.015] px-3 text-[12px] text-[#F0EFEC]/55 transition-colors hover:bg-white/[0.04] hover:text-[#F0EFEC]/75"
            >
              <img src={item.icon} alt="" className="size-3.5 object-contain" />
              {item.label}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function Composer({
  draft,
  busy,
  inputRef,
  attachments,
  onDraft,
  onSend,
  onFiles,
  onRemoveFile
}: {
  draft: string
  busy: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
  attachments: KobbiAttachment[]
  onDraft: (value: string) => void
  onSend: () => void
  onFiles: (files: FileList) => void
  onRemoveFile: (name: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const canSend = draft.trim().length > 0 || attachments.length > 0

  function onSubmit(event: FormEvent): void {
    event.preventDefault()
    onSend()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSend()
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-[108px] flex-col rounded-[22px] bg-[#1C1C1C] pt-3.5 pr-3 pb-3 pl-4"
    >
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5 pr-12">
          {attachments.map((file) =>
            file.mime.startsWith('image/') ? (
              <button
                key={file.name}
                type="button"
                onClick={() => onRemoveFile(file.name)}
                className="overflow-hidden rounded-[10px] border border-white/[0.06]"
              >
                <img src={file.dataUrl} alt={file.name} className="h-11 w-11 object-cover" />
              </button>
            ) : (
              <button
                key={file.name}
                type="button"
                onClick={() => onRemoveFile(file.name)}
                className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-[#F0EFEC]/45"
              >
                {file.name}
              </button>
            )
          )}
        </div>
      ) : null}
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Tire suas dúvidas com o Kobbi....."
        className="min-h-[44px] w-full resize-none bg-transparent text-[14px] leading-5 font-medium text-[#F0EFEC]/82 placeholder:text-[#F0EFEC]/33"
      />
      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          aria-label="Anexar"
          onClick={() => fileRef.current?.click()}
          className="flex size-8 items-center justify-center rounded-full text-[#F0EFEC]/28 transition-colors hover:text-[#F0EFEC]/50"
        >
          <Paperclip className="size-4" strokeWidth={1.7} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.txt,.csv,.json"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) onFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <button
          type="submit"
          disabled={busy || !canSend}
          aria-label="Enviar"
          className="kobbi-send disabled:opacity-40"
        >
          <span className="kobbi-send-inner">
            <img src={sendMark} alt="" className="size-[15px] object-contain" />
          </span>
        </button>
      </div>
    </form>
  )
}

function ImagePreview({
  attachment,
  onClose
}: {
  attachment: KobbiAttachment | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!attachment) return
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [attachment, onClose])

  return createPortal(
    <AnimatePresence>
      {attachment ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-8">
          <motion.button
            type="button"
            aria-label="Fechar imagem"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/72 backdrop-blur-[10px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 max-h-full max-w-full"
          >
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="absolute -top-10 right-0 flex size-8 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" strokeWidth={1.8} />
            </button>
            <img
              src={attachment.dataUrl}
              alt={attachment.name}
              className="max-h-[82vh] max-w-[min(860px,86vw)] rounded-[18px] object-contain shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            />
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
