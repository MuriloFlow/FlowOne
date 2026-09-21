import { useEffect, useRef } from 'react'

type ConfettiBurstProps = {
  active: boolean
  durationMs?: number
}

/** Confete leve no canvas — sem dependência externa. */
export function ConfettiBurst({ active, durationMs = 2200 }: ConfettiBurstProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!active) return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      canvas.width = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const colors = ['#F0EFEC', '#E8C547', '#7DD3A7', '#6BB3F0', '#F0A0A0', '#C4B5FD']
    const count = durationMs > 3000 ? 140 : 56
    const pieces = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.clientWidth,
      y: -20 - Math.random() * 80,
      w: 4 + Math.random() * 6,
      h: 6 + Math.random() * 8,
      vy: 2.2 + Math.random() * 3.4,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)]
    }))

    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const elapsed = now - started
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      const alpha = elapsed > durationMs - 500 ? Math.max(0, 1 - (elapsed - (durationMs - 500)) / 500) : 1
      for (const piece of pieces) {
        piece.x += piece.vx
        piece.y += piece.vy
        piece.rot += piece.vr
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(piece.x, piece.y)
        ctx.rotate(piece.rot)
        ctx.fillStyle = piece.color
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h)
        ctx.restore()
      }
      if (elapsed < durationMs) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    }
    frame = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [active, durationMs])

  if (!active) return null
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      aria-hidden
    />
  )
}
