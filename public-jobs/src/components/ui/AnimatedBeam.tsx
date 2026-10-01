import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from 'react'

// Adaptação do "animated-beam" (MagicUI): feixe de luz animado ligando dois
// elementos — usado no diagrama "tudo se conecta" (Empresa → Recruta+ → Você).

type BeamProps = {
  containerRef: RefObject<HTMLElement | null>
  fromRef: RefObject<HTMLElement | null>
  toRef: RefObject<HTMLElement | null>
  curvature?: number
  duration?: number
  delay?: number
  reverse?: boolean
}

function useBeamPath({ containerRef, fromRef, toRef, curvature = 0 }: Omit<BeamProps, 'duration' | 'delay' | 'reverse'>) {
  const [path, setPath] = useState('')
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    function measure(): void {
      const container = containerRef.current
      const from = fromRef.current
      const to = toRef.current
      if (!container || !from || !to) return
      const base = container.getBoundingClientRect()
      const a = from.getBoundingClientRect()
      const b = to.getBoundingClientRect()
      const x1 = a.left - base.left + a.width / 2
      const y1 = a.top - base.top + a.height / 2
      const x2 = b.left - base.left + b.width / 2
      const y2 = b.top - base.top + b.height / 2
      setSize({ width: base.width, height: base.height })

      const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1)
      if (horizontal) {
        const control = (x1 + x2) / 2
        setPath(`M ${x1} ${y1} C ${control} ${y1}, ${control} ${y2}, ${x2} ${y2}`)
      } else {
        const middle = (y1 + y2) / 2
        const bend = middle + curvature
        setPath(`M ${x1} ${y1} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${y2}`)
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [containerRef, fromRef, toRef, curvature])

  return { path, size }
}

export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  duration = 3,
  delay = 0,
  reverse = false,
}: BeamProps) {
  const id = useId().replace(/[:]/g, '')
  const { path, size } = useBeamPath({ containerRef, fromRef, toRef, curvature })
  const gradientId = `beam-gradient-${id}`

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-0"
      width={size.width}
      height={size.height}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0" />
          <stop offset="45%" stopColor="var(--brand-500)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--brand-300)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path} stroke="var(--line)" strokeWidth="1.5" strokeLinecap="round" />
      <path d={path} stroke={`url(#${gradientId})`} strokeWidth="2.5" strokeLinecap="round" />
      <path
        d={path}
        stroke="var(--brand-500)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="6 240"
        style={
          {
            animation: `beam-flow ${duration}s linear ${delay}s infinite ${reverse ? 'reverse' : 'normal'}`
          } as CSSProperties
        }
      />
    </svg>
  )
}
