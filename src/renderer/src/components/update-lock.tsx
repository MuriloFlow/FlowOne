import { AnimatePresence, motion } from 'framer-motion'
import type { UpdateStatus } from '../../../shared/ipc'

type UpdateLockProps = {
  status: UpdateStatus
}

export function UpdateLock({ status }: UpdateLockProps) {
  const locked =
    status.state === 'ready' || status.state === 'downloading' || status.state === 'available'
  const percent = status.state === 'downloading' ? status.percent : status.state === 'ready' ? 100 : 0
  const ready = status.state === 'ready'

  return (
    <AnimatePresence>
      {locked ? (
        <motion.div
          className="absolute inset-0 z-[200] flex items-center justify-center bg-[#111111]/72 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-[min(420px,calc(100%-48px))] flex-col items-center rounded-[22px] border border-white/[0.06] bg-[#161616] px-8 py-9 text-center shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
          >
            <p className="text-[11px] tracking-[0.18em] text-[#F0EFEC]/32 uppercase">FLOW</p>
            <h2 className="mt-3 text-[22px] leading-tight text-[#F0EFEC]/92">
              {ready ? 'Atualização pronta' : 'Atualizando o FLOW'}
            </h2>
            <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-[#F0EFEC]/42">
              {ready
                ? 'Reinicie para aplicar a versão nova. O aplicativo fica bloqueado até isso.'
                : 'Uma versão nova foi encontrada e já está sendo baixada.'}
            </p>

            {!ready ? (
              <div className="mt-7 w-full">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full bg-[#F0EFEC]"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(percent, 8)}%` }}
                    transition={{ duration: 0.24, ease: 'easeOut' }}
                  />
                </div>
                <p className="mt-3 text-[12px] text-[#F0EFEC]/38">
                  {status.state === 'available' ? 'Preparando download…' : `Baixando ${percent}%`}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void window.flow.updater.install()}
                className="mt-8 h-11 w-full rounded-[12px] bg-[#F0EFEC] text-[14px] font-medium text-[#111111] transition-opacity hover:opacity-90"
              >
                Reiniciar
              </button>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
