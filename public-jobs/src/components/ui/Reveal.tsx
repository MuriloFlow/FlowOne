import { useEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Animações dirigidas por scroll (GSAP ScrollTrigger) — usadas com moderação:
// entrada suave de seções e contadores. Respeitam "reduzir movimento" do
// sistema operacional (público 30+, nada de exagero).

let registered = false
function ensureGsap(): void {
  if (registered) return
  gsap.registerPlugin(ScrollTrigger)
  registered = true
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Revela o conteúdo quando ele entra na tela (fade + subida + leve blur). */
export function Reveal({
  children,
  className = '',
  delay = 0,
  y = 26,
  blur = true,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  blur?: boolean
}) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (prefersReducedMotion()) {
      gsap.set(element, { opacity: 1, y: 0, clearProps: 'filter' })
      return
    }
    ensureGsap()
    const context = gsap.context(() => {
      gsap.fromTo(
        element,
        { opacity: 0, y, filter: blur ? 'blur(6px)' : 'none' },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.75,
          delay,
          ease: 'power3.out',
          scrollTrigger: { trigger: element, start: 'top 88%', once: true }
        }
      )
    })
    return () => context.revert()
  }, [blur, delay, y])

  return (
    <div ref={ref as never} className={className}>
      {children}
    </div>
  )
}

/** Contador que sobe até o valor quando aparece na tela. */
export function Counter({
  value,
  suffix = '',
  prefix = '',
  duration = 1.4,
  className = '',
}: {
  value: number
  suffix?: string
  prefix?: string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const format = (current: number) => `${prefix}${Math.round(current).toLocaleString('pt-BR')}${suffix}`
    if (prefersReducedMotion()) {
      element.textContent = format(value)
      return
    }
    ensureGsap()
    const counter = { current: 0 }
    const context = gsap.context(() => {
      gsap.to(counter, {
        current: value,
        duration,
        ease: 'power2.out',
        snap: { current: 1 },
        onUpdate: () => {
          element.textContent = format(counter.current)
        },
        scrollTrigger: { trigger: element, start: 'top 92%', once: true }
      })
    })
    return () => context.revert()
  }, [duration, prefix, suffix, value])

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  )
}
