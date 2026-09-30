import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Logo } from '../components/Logo'

// Layout público (header sticky + footer) — clone da referência.

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#/" className="transition-opacity hover:opacity-80" aria-label="Início">
            <Logo subtitle="Digaspi Ribeirão Pires" />
          </a>

          <nav className="flex items-center gap-1 sm:gap-2">
            <motion.a
              whileHover={{ y: -1 }}
              whileTap={{ y: 0 }}
              href="#/"
              className="hidden rounded-lg px-3 py-2 text-[14px] font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 sm:block"
            >
              Vagas abertas
            </motion.a>
            <motion.a
              whileHover={{ y: -1 }}
              whileTap={{ y: 0, scale: 0.97 }}
              href="#/"
              className="btn-brand !px-4 !py-2 text-[14px]"
            >
              Ver oportunidades
            </motion.a>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-ink-100 bg-ink-50/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
          <Logo size={28} subtitle={undefined} />
          <p className="text-[12.5px] text-ink-400">
            © {new Date().getFullYear()} Digaspi Ribeirão Pires · Plataforma de Contratação · Seus dados estão
            protegidos
          </p>
        </div>
      </footer>
    </div>
  )
}
