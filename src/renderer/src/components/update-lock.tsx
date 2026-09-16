import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { UpdateStatus } from '../../../shared/ipc'

type UpdateLockProps = {
  status: UpdateStatus
}

export function UpdateLock({ status }: UpdateLockProps) {
  const [installing, setInstalling] = useState(false)
  const visible =
    status.state === 'ready' || status.state === 'downloading' || status.state === 'available'
  const ready = status.state === 'ready'
  const percent = status.state === 'downloading' ? status.percent : ready ? 100 : 0

  function restart() {
    if (!ready || installing) return
    setInstalling(true)
    void window.flow.updater.install()
  }

  let label = 'Preparando atualização…'
  if (installing) label = 'Atualizando…'
  else if (ready) label = 'Existem atualizações pendentes. Reinicie o aplicativo clicando aqui'
  else if (status.state === 'downloading') label = `Baixando atualização… ${percent}%`

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[180] flex justify-center px-4 pb-4"
        >
          <button
            type="button"
            disabled={!ready || installing}
            onClick={restart}
            className="pointer-events-auto inline-flex min-h-10 max-w-[min(640px,calc(100%-24px))] items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-[#161616]/96 px-4 py-2 text-center text-[13px] text-[#F0EFEC]/78 shadow-[0_16px_40px_rgba(0,0,0,0.4)] backdrop-blur-md transition-colors hover:bg-[#1A1A1A] disabled:hover:bg-[#161616]/96"
          >
            {installing ? <Loader2 className="size-3.5 shrink-0 animate-spin text-[#F0EFEC]/70" /> : null}
            <span className={ready && !installing ? 'underline decoration-white/20 underline-offset-4' : undefined}>
              {label}
            </span>
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
