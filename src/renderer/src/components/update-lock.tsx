import { AnimatePresence, motion } from 'framer-motion'
import type { UpdateStatus } from '../../../shared/ipc'

type UpdateLockProps = {
  status: UpdateStatus
}

export function UpdateLock({ status }: UpdateLockProps) {
  const locked = status.state === 'ready'
  const downloading = status.state === 'downloading' || status.state === 'available'

  return (
    <>
      {downloading && !locked ? (
        <div className="pointer-events-none absolute top-8 right-0 left-0 z-30 flex justify-center">
          <div className="mt-3 rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] text-white/55 backdrop-blur-sm">
            {status.state === 'downloading'
              ? `Baixando atualização… ${status.percent}%`
              : 'Atualização encontrada. Preparando…'}
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {locked ? (
          <>
            <motion.div
              className="absolute inset-0 z-40 bg-[#111111]/35 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              className="absolute right-0 bottom-0 left-0 z-50"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="border-t border-white/10 bg-[#161616]/95 px-8 py-5 shadow-[0_-24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <p className="text-sm text-white/80">
                  Existem atualizações pendentes.{' '}
                  <button
                    type="button"
                    className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
                    onClick={() => void window.flow.updater.install()}
                  >
                    Reinicie o aplicativo clicando aqui
                  </button>
                </p>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
