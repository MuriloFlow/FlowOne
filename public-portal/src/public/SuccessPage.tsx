import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Mail, Search } from 'lucide-react'
import { Logo } from '../components/Logo'

// Página de sucesso — clone da referência.

export default function SuccessPage({ navigate }: { navigate: (to: string) => void }) {
  return (
    <div className="relative flex min-h-[calc(100vh-4rem-73px)] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-80 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-100/50 blur-3xl"
        aria-hidden
      />

      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="relative flex h-20 w-20 items-center justify-center rounded-3xl shadow-pop shadow-brand-500/30"
        style={{ backgroundColor: 'var(--brand-500)', color: 'var(--brand-contrast)' }}
      >
        <CheckCircle2 size={40} strokeWidth={2.2} />
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 12 }}
          className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-surface shadow-lift"
        >
          <span className="text-[15px]">🎉</span>
        </motion.span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="text-balance mt-7 max-w-md font-display text-3xl font-bold tracking-[-0.03em] text-ink-950"
      >
        Candidatura enviada com sucesso!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-500"
      >
        Recebemos sua candidatura com muito interesse. Nosso time de RH da Digaspi Ribeirão Pires vai analisar seu
        perfil e entrar em contato pelos dados informados.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.33, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 flex w-full max-w-sm flex-col gap-2.5"
      >
        <div className="card flex items-center gap-3 p-4 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Mail size={17} />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-ink-900">Acompanhe seu e-mail</p>
            <p className="text-[12.5px] text-ink-500">Você será avisado(a) em cada etapa do processo.</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Search size={17} />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-ink-900">Continue explorando</p>
            <p className="text-[12.5px] text-ink-500">Novas vagas abrem toda semana.</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
      >
        <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="btn-brand" onClick={() => navigate('/')}>
          Explorar outras vagas <ArrowRight size={16} />
        </motion.button>
        <a
          href="https://recruta.flwdesk.com/search"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-500 transition-colors hover:text-brand-700"
        >
          Ver vagas de outras empresas no Recruta+
        </a>
        <div className="opacity-40">
          <Logo size={26} withText={false} />
        </div>
      </motion.div>
    </div>
  )
}
