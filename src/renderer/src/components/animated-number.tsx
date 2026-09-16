import { useEffect, useRef, useState } from 'react'
import { formatBRLFromCents, formatCount } from '@/lib/format'

type AnimatedNumberProps = {
  value: number
  className?: string
}

type AnimatedMoneyProps = {
  cents: number
  className?: string
}

export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const [shown, setShown] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 720)
      const eased = 1 - (1 - progress) ** 3
      const next = from + (value - from) * eased
      const rounded = Math.round(next)
      setShown(rounded)
      fromRef.current = rounded
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <span className={className}>{formatCount(shown)}</span>
}

export function AnimatedMoney({ cents, className }: AnimatedMoneyProps) {
  const [shown, setShown] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 720)
      const eased = 1 - (1 - progress) ** 3
      const rounded = Math.round(from + (cents - from) * eased)
      setShown(rounded)
      fromRef.current = rounded
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [cents])

  return <span className={className}>{formatBRLFromCents(shown)}</span>
}
