import { useEffect, useRef, useState } from 'react'
import type { KobbiAttachment, KobbiDeltaEvent, KobbiDoneEvent, KobbiErrorEvent, KobbiHistoryMessage } from '../../../shared/kobbi'

export type ChatMessage = KobbiHistoryMessage & {
  id: string
  generating?: boolean
  attachments?: KobbiAttachment[]
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function kobbi() {
  if (!window.flow?.kobbi) throw new Error('Kobbi indisponível.')
  return window.flow.kobbi
}

export function useKobbi(storeId: string | null, userName: string, userRole: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<KobbiAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingId = useRef<string | null>(null)

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
        current.map((item) => (item.id === event.id ? { ...item, generating: false } : item))
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

  return {
    messages,
    draft,
    setDraft,
    attachments,
    busy,
    error,
    send,
    fill,
    addFiles,
    removeAttachment
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
