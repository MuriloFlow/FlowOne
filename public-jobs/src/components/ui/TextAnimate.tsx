import { motion, type Variants } from 'framer-motion'
import type { ElementType } from 'react'

// Adaptação do "text-animate" (MagicUI) para o nosso design system: anima
// palavra por palavra (ou letra por letra) quando entra na tela.

type AnimationKind = 'fadeIn' | 'slideUp' | 'blurInUp'

const VARIANTS: Record<AnimationKind, Variants> = {
  fadeIn: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.42, ease: 'easeOut' } }
  },
  slideUp: {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }
  },
  blurInUp: {
    hidden: { opacity: 0, y: 10, filter: 'blur(8px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
    }
  }
}

export function TextAnimate({
  text,
  by = 'word',
  animation = 'blurInUp',
  delay = 0,
  stagger = 0.05,
  className = '',
  as: Tag = 'p',
  once = true,
}: {
  text: string
  by?: 'word' | 'character'
  animation?: AnimationKind
  delay?: number
  stagger?: number
  className?: string
  as?: ElementType
  once?: boolean
}) {
  const segments = by === 'word' ? text.split(' ') : text.split('')
  const variants = VARIANTS[animation]
  return (
    <Tag className={className}>
      <motion.span
        className="inline"
        initial="hidden"
        whileInView="show"
        viewport={{ once, amount: 0.4 }}
        transition={{ staggerChildren: stagger, delayChildren: delay }}
      >
        {segments.map((segment, index) => (
          <motion.span key={`${segment}-${index}`} variants={variants} className="inline-block">
            {segment === ' ' ? '\u00A0' : segment}
            {by === 'word' && index < segments.length - 1 ? '\u00A0' : ''}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  )
}
