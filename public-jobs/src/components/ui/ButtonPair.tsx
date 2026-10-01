import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

export const PORTAL_CANDIDATE_URL = 'https://rh.flwdesk.com/digaspi/#/candidato'

/** Par de botões padrão do site inteiro — "Começar agora" (primário, com
 * brilho suave na cor da marca) + "Entrar" (escuro), como no screenshot. */
export function ButtonPair({
  primaryLabel = 'Começar agora',
  primaryHref = '/search',
  secondaryLabel = 'Entrar',
  secondaryHref = PORTAL_CANDIDATE_URL,
  size = 'md',
  className = '',
}: {
  primaryLabel?: string
  primaryHref?: string
  secondaryLabel?: string
  secondaryHref?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const pad =
    size === 'lg'
      ? 'px-7 py-3.5 text-[15.5px]'
      : size === 'sm'
        ? 'px-4 py-2 text-[13px]'
        : 'px-5 py-2.5 text-[14px]'
  return (
    <div className={`inline-flex flex-wrap items-center gap-2.5 ${className}`}>
      <motion.a
        href={primaryHref}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        className={`btn-primary-glow inline-flex items-center justify-center gap-2 rounded-xl font-semibold ${pad}`}
      >
        {primaryLabel}
        <ArrowRight size={size === 'sm' ? 14 : 16} />
      </motion.a>
      <motion.a
        href={secondaryHref}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        className={`btn-dark-soft inline-flex items-center justify-center gap-2 rounded-xl font-semibold ${pad}`}
      >
        {secondaryLabel}
      </motion.a>
    </div>
  )
}
