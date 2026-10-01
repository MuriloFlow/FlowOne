import { useEffect, useRef } from 'react'
import type { COBEOptions } from 'cobe'

// Globo (COBE) — mostra de onde vêm as empresas credenciadas. Leve, roda em
// canvas e respeita "reduzir movimento" (não gira quando desativado).

type Marker = { location: [number, number]; size?: number }

export const DEFAULT_MARKERS: Marker[] = [
  // Empresas credenciadas — região do Grande ABC e São Paulo (Brasil).
  { location: [-23.6743, -46.5654], size: 0.09 }, // Ribeirão Pires / ABC
  { location: [-23.5505, -46.6333], size: 0.07 }, // São Paulo
  { location: [-23.6944, -46.5654], size: 0.06 }, // Mauá
  { location: [-23.6666, -46.5322], size: 0.06 } // Santo André
]

export function Globe({ className = '', markers = DEFAULT_MARKERS }: { className?: string; markers?: Marker[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const phiRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let width = container.offsetWidth
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let destroyed = false
    let globe: { destroy: () => void } | null = null
    let cancelled = false

    // O globo (WebGL) é carregado sob demanda — não pesa no primeiro acesso.
    void (async () => {
      let createGlobe: (canvas: HTMLCanvasElement, options: COBEOptions) => { destroy: () => void }
      try {
        createGlobe = (await import('cobe')).default
      } catch {
        return
      }
      if (cancelled || !canvas.isConnected) return
      try {
        globe = createGlobe(canvas, {
        onRender: (state: COBEOptions) => {
          if (!reduced && !destroyed) phiRef.current += 0.0032
          state.phi = phiRef.current
          state.width = width * 2
          state.height = width * 2
        },
        devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
        width: width * 2,
        height: width * 2,
        phi: 0,
        theta: 0.28,
        dark: 0.55,
        diffuse: 1.15,
        mapSamples: 16000,
        mapBrightness: 5.4,
        baseColor: [0.42, 0.48, 0.6],
        markerColor: [0.1, 0.8, 0.42],
        glowColor: [0.32, 0.42, 0.38],
          markers,
          opacity: 0.96
        } as COBEOptions)
      } catch {
        // Sem WebGL: mantém o fallback visual (gradiente) — sem quebrar a página.
      }
    })()

    const onResize = () => {
      width = container.offsetWidth
    }
    window.addEventListener('resize', onResize)

    return () => {
      destroyed = true
      cancelled = true
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
      globe?.destroy()
    }
  }, [markers])

  return (
    <div ref={containerRef} className={`relative aspect-square w-full ${className}`}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, var(--brand-soft-2), transparent 62%)'
        }}
        aria-hidden
      />
      <canvas
        ref={canvasRef}
        className="relative z-10 h-full w-full [contain:layout_paint_size]"
      />
    </div>
  )
}
