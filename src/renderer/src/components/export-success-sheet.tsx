import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Download, FileDown, ImageDown, Loader2, Share2, X } from 'lucide-react'
import { saveToDevice, shareFile } from '@/lib/native-export'
import { cn } from '@/lib/utils'

type ExportSuccessSheetProps = {
  open: boolean
  kind: 'image' | 'pdf'
  title: string
  subtitle: string
  fileName: string
  shareTitle: string
  /** Abre o compartilhamento nativo sozinho logo após aparecer. */
  autoShare?: boolean
  /** Muda a cada geração para reativar o disparo automático. */
  autoShareKey?: string
  allowDownload?: boolean
  getBlob: () => Blob | null
  onClose: () => void
}

const CANCEL_PATTERN = /share canceled|sharing canceled|user.?cancel|cancelad|abort/i

/**
 * Tela de sucesso de exportação no mobile: confirma que o arquivo foi gerado e
 * entrega as ações — compartilhar pelo sistema (WhatsApp, Telegram etc.) e,
 * quando faz sentido, salvar no armazenamento do celular.
 */
export function ExportSuccessSheet({
  open,
  kind,
  title,
  subtitle,
  fileName,
  shareTitle,
  autoShare = false,
  autoShareKey = '',
  allowDownload = false,
  getBlob,
  onClose
}: ExportSuccessSheetProps) {
  const [sharing, setSharing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setSharing(false)
    setSaving(false)
    setShareError(null)
    setSavedNote(null)
  }, [open])

  useEffect(() => {
    if (!open || !autoShare) return
    const timer = window.setTimeout(() => {
      void runShare()
    }, 550)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoShare, autoShareKey])

  async function runShare(): Promise<void> {
    const blob = getBlob()
    if (!blob || sharing || saving) return
    setSharing(true)
    setShareError(null)
    try {
      await shareFile(blob, fileName, shareTitle)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível compartilhar agora.'
      if (!CANCEL_PATTERN.test(message)) setShareError(message)
    } finally {
      setSharing(false)
    }
  }

  async function runSave(): Promise<void> {
    const blob = getBlob()
    if (!blob || sharing || saving) return
    setSaving(true)
    setShareError(null)
    try {
      const saved = await saveToDevice(blob, fileName)
      setSavedNote(`Salvo no celular em ${saved.location}.`)
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Não foi possível salvar o arquivo agora.')
    } finally {
      setSaving(false)
    }
  }

  const busy = sharing || saving

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[420]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/55" onClick={onClose} />
          <motion.div
            initial={{ y: 48 }}
            animate={{ y: 0 }}
            exit={{ y: 48 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="absolute inset-x-0 bottom-0 rounded-t-[20px] bg-[#151515] px-4 pt-3 pb-[calc(var(--flow-safe-bottom)+14px)]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/12" />

            <div className="flex items-start gap-3 px-1 pt-1 pb-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#34D399]/12 text-[#34D399]">
                {kind === 'pdf' ? (
                  <FileDown className="size-6" strokeWidth={1.7} />
                ) : (
                  <ImageDown className="size-6" strokeWidth={1.7} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[16px] text-[#F0EFEC]/90">
                  {title}
                  <CheckCircle2 className="size-4 shrink-0 text-[#34D399]" strokeWidth={2} />
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#F0EFEC]/45">{subtitle}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={onClose}
                disabled={busy}
                className="flex size-9 items-center justify-center text-[#F0EFEC]/50 disabled:opacity-40"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex items-center gap-2.5 rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
              {kind === 'pdf' ? (
                <FileDown className="size-4 shrink-0 text-[#F0EFEC]/35" strokeWidth={1.7} />
              ) : (
                <ImageDown className="size-4 shrink-0 text-[#F0EFEC]/35" strokeWidth={1.7} />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#F0EFEC]/70">{fileName}</span>
            </div>

            {shareError ? (
              <p className="mt-3 rounded-[10px] border border-red-500/15 bg-red-500/8 px-3 py-2.5 text-[12px] leading-relaxed text-red-300/80">
                {shareError}
              </p>
            ) : null}
            {savedNote ? (
              <p className="mt-3 rounded-[10px] border border-[#34D399]/15 bg-[#34D399]/8 px-3 py-2.5 text-[12px] leading-relaxed text-[#34D399]/90">
                {savedNote}
              </p>
            ) : null}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runShare()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#F0EFEC] text-[14px] font-medium text-[#111111] disabled:opacity-45"
              >
                {sharing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Share2 className="size-4" strokeWidth={1.8} />
                )}
                {sharing ? 'Abrindo compartilhamento…' : 'Compartilhar agora'}
              </button>
              {allowDownload ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runSave()}
                  className={cn(
                    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px]',
                    'border border-white/[0.08] bg-white/[0.04] text-[14px] text-[#F0EFEC]/80 disabled:opacity-45'
                  )}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" strokeWidth={1.8} />
                  )}
                  {saving ? 'Salvando no celular…' : 'Baixar no celular'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-10 w-full rounded-[12px] text-[13px] text-[#F0EFEC]/45 disabled:opacity-40"
              >
                Concluir
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
