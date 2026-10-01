import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react'

// Adaptação do "intro-disclosure" (cult-ui): explica passo a passo, avança
// sozinho e permite navegar no clique. Pensado para público 30+: legível,
// controles grandes e pausa automática quando o mouse descansa em cima.

export type IntroStep = {
  title: string
  content: string
  media?: ReactNode
  icon?: ReactNode
}

export function IntroDisclosure({
  steps,
  autoPlay = true,
  interval = 6500,
  className = '',
}: {
  steps: IntroStep[]
  autoPlay?: boolean
  interval?: number
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(autoPlay)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!playing || steps.length <= 1) return
    timerRef.current = window.setTimeout(() => {
      setIndex((current) => (current + 1) % steps.length)
    }, interval)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [index, interval, playing, steps.length])

  const step = steps[index]

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${className}`}
      onMouseEnter={() => setPlaying(false)}
      onMouseLeave={() => setPlaying(autoPlay)}
    >
      <div className="grid gap-0 md:grid-cols-[1.05fr_1fr]">
        {/* Mídia / ilustração do passo */}
        <div
          className="relative flex min-h-[220px] items-center justify-center overflow-hidden border-b border-line p-8 md:border-b-0 md:border-r"
          style={{ background: 'linear-gradient(160deg, var(--brand-soft), transparent 70%)' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              {step.media ?? (
                <span
                  className="mx-auto flex size-20 items-center justify-center rounded-2xl border border-line bg-surface text-brand-600 shadow-lift"
                >
                  {step.icon}
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Conteúdo */}
        <div className="flex flex-col p-6 sm:p-7">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-400">
              Passo {index + 1} de {steps.length}
            </span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-100">
              <motion.span
                key={`${index}-${playing}`}
                className="block h-full rounded-full"
                style={{ backgroundColor: 'var(--brand-500)' }}
                initial={{ width: '0%' }}
                animate={{ width: playing ? '100%' : '38%' }}
                transition={{ duration: playing ? interval / 1000 : 0.4, ease: 'linear' }}
              />
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="mt-4 flex-1"
            >
              <h3 className="font-display text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink-950">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{step.content}</p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {steps.map((item, position) => (
                <button
                  key={item.title}
                  type="button"
                  aria-label={`Ir para o passo ${position + 1}`}
                  onClick={() => setIndex(position)}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: position === index ? 22 : 8,
                    backgroundColor: position === index ? 'var(--brand-500)' : 'var(--ink-200)'
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPlaying((value) => !value)}
                className="flex size-9 items-center justify-center rounded-full border border-line text-ink-500 transition-colors hover:text-ink-900"
                aria-label={playing ? 'Pausar' : 'Continuar'}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setIndex((current) => (current - 1 + steps.length) % steps.length)}
                className="flex size-9 items-center justify-center rounded-full border border-line text-ink-600 transition-colors hover:border-ink-300 hover:text-ink-900"
                aria-label="Passo anterior"
              >
                <ArrowLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setIndex((current) => (current + 1) % steps.length)}
                className="btn-primary-glow flex size-9 items-center justify-center rounded-full"
                aria-label="Próximo passo"
              >
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
