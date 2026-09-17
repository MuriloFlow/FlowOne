import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  KobbiAttachment,
  KobbiChartSpec,
  KobbiDeltaEvent,
  KobbiDoneEvent,
  KobbiErrorEvent,
  KobbiHistoryMessage,
  KobbiRatingValue,
  KobbiThread
} from '../../../shared/kobbi'

export type ChatMessage = KobbiHistoryMessage & {
  id: string
  generating?: boolean
  attachments?: KobbiAttachment[]
  chart?: KobbiChartSpec | null
  rating?: KobbiRatingValue | null
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function kobbi() {
  if (!window.flow?.kobbi) throw new Error('Kobbi indisponível.')
  return window.flow.kobbi
}

function hasExchange(messages: ChatMessage[]): boolean {
  return (
    messages.some((item) => item.role === 'user' && item.content.trim()) &&
    messages.some((item) => item.role === 'assistant' && item.content.trim() && !item.generating)
  )
}

function threadTitle(messages: ChatMessage[]): string {
  const first = messages.find((item) => item.role === 'user' && item.content.trim())
  return (first?.content ?? 'Conversa').replace(/\s+/g, ' ').trim().slice(0, 72)
}

function toStored(messages: ChatMessage[]) {
  return messages
    .filter((item) => !item.generating && item.content.trim())
    .map((item) => ({ role: item.role, content: item.content }))
}

export function useKobbi(storeId: string | null, userName: string, userRole: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<KobbiAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [threads, setThreads] = useState<KobbiThread[]>([])
  const pendingId = useRef<string | null>(null)
  const threadId = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  const refreshThreads = useCallback(async () => {
    try {
      const list = await kobbi().listThreads()
      setThreads(list)
    } catch {
      /* histórico opcional até o SQL 0008 */
    }
  }, [])

  const archiveIfNeeded = useCallback(async (): Promise<void> => {
    const current = messagesRef.current
    if (!hasExchange(current)) return
    try {
      const saved = await kobbi().saveThread({
        id: threadId.current ?? undefined,
        title: threadTitle(current),
        messages: toStored(current)
      })
      threadId.current = saved.id
      await refreshThreads()
    } catch (archiveError) {
      logArchive(archiveError)
    }
  }, [refreshThreads])

  useEffect(() => {
    const api = window.flow?.kobbi
    if (!api) return
    const offDelta = api.onDelta((event: KobbiDeltaEvent) => {
      setMessages((current) =>
        current.map((item) =>
          item.id === event.id
            ? { ...item, generating: false, content: `${item.content}${event.text}` }
            : item
        )
      )
    })
    const offDone = api.onDone((event: KobbiDoneEvent) => {
      if (pendingId.current === event.id) {
        pendingId.current = null
        setBusy(false)
      }
      setMessages((current) =>
        current.map((item) =>
          item.id === event.id ? { ...item, generating: false, chart: event.chart ?? item.chart ?? null } : item
        )
      )
    })
    const offError = api.onError((event: KobbiErrorEvent) => {
      if (pendingId.current === event.id) {
        pendingId.current = null
        setBusy(false)
      }
      setError(event.message)
      setMessages((current) =>
        current.map((item) =>
          item.id === event.id
            ? { ...item, generating: false, content: item.content || 'Não consegui responder agora.' }
            : item
        )
      )
    })
    return () => {
      offDelta()
      offDone()
      offError()
    }
  }, [])

  async function send(text?: string): Promise<void> {
    const content = (text ?? draft).trim()
    const files = attachments
    if (busy || (!content && files.length === 0)) return
    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      content: content || (files.some((file) => file.mime.startsWith('image/')) ? 'O que tem nesta imagem?' : 'Anexo'),
      attachments: files
    }
    const assistantId = newId()
    const history = [...messages, userMessage].map(({ role, content: body }) => ({ role, content: body }))
    pendingId.current = assistantId
    setBusy(true)
    setError(null)
    setDraft('')
    setAttachments([])
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', generating: true }
    ])
    try {
      await kobbi().send({
        id: assistantId,
        storeId,
        userName,
        userRole,
        messages: history,
        attachments: files
      })
    } catch (sendError) {
      pendingId.current = null
      setBusy(false)
      setError(sendError instanceof Error ? sendError.message : 'Falha ao falar com o Kobbi.')
    }
  }

  function fill(text: string): void {
    setDraft(text)
  }

  async function addFiles(files: FileList | File[]): Promise<void> {
    const next: KobbiAttachment[] = []
    for (const file of Array.from(files).slice(0, 3)) {
      if (file.size > 4_000_000) continue
      next.push({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        dataUrl: await readFile(file)
      })
    }
    setAttachments((current) => [...current, ...next].slice(0, 3))
  }

  function removeAttachment(name: string): void {
    setAttachments((current) => current.filter((item) => item.name !== name))
  }

  async function newChat(): Promise<void> {
    await archiveIfNeeded()
    threadId.current = null
    pendingId.current = null
    setBusy(false)
    setError(null)
    setDraft('')
    setAttachments([])
    setMessages([])
  }

  async function openHistory(): Promise<void> {
    await archiveIfNeeded()
    await refreshThreads()
  }

  async function loadThread(thread: KobbiThread): Promise<void> {
    await archiveIfNeeded()
    threadId.current = thread.id
    setBusy(false)
    setError(null)
    setDraft('')
    setAttachments([])
    setMessages(
      thread.messages.map((item) => ({
        id: newId(),
        role: item.role,
        content: item.content
      }))
    )
  }

  async function rate(messageId: string, rating: KobbiRatingValue): Promise<void> {
    const target = messagesRef.current.find((item) => item.id === messageId)
    if (!target || target.role !== 'assistant' || !target.content.trim()) return
    setMessages((current) => current.map((item) => (item.id === messageId ? { ...item, rating } : item)))
    try {
      await kobbi().rate({
        threadId: threadId.current,
        content: target.content,
        rating
      })
    } catch {
      /* avaliação segue no estado local */
    }
  }

  return {
    messages,
    draft,
    setDraft,
    attachments,
    busy,
    error,
    threads,
    send,
    fill,
    addFiles,
    removeAttachment,
    newChat,
    openHistory,
    loadThread,
    archiveIfNeeded,
    rate
  }
}

function logArchive(error: unknown): void {
  console.warn('[kobbi] histórico', error instanceof Error ? error.message : error)
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
