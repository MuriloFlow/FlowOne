import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfettiBurst } from '@/components/confetti-burst'
import type { SorteioClient } from '../../../shared/sorteio'

type SorteioDrawOverlayProps = {
  winner: SorteioClient
  onClose: () => void
}

export function pickSorteioWinner(clients: SorteioClient[]): SorteioClient | null {
  const pool = clients.filter((client) => client.chances > 0)
  const total = pool.reduce((sum, client) => sum + client.chances, 0)
  if (!total) return null
  let ticket = Math.random() * total
  for (const client of pool) {
    ticket -= client.chances
    if (ticket <= 0) return client
  }
  return pool[pool.length - 1] ?? null
}

export function SorteioDrawOverlay({ winner, onClose }: SorteioDrawOverlayProps) {
  const [count, setCount] = useState(5)
  const revealed = count <= 0

  useEffect(() => {
    if (count <= 0) return
    const timer = window.setTimeout(() => setCount((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [count])

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#111111]/92 px-6 backdrop-blur-md">
      <ConfettiBurst active={revealed} durationMs={4200} />
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        {!revealed ? (
          <>
            <p className="text-[13px] uppercase tracking-[0.18em] text-[#F0EFEC]/35">Sorteando</p>
            <p className="mt-4 text-[120px] font-medium leading-none tracking-tight text-[#F0EFEC]">{count}</p>
          </>
        ) : (
          <>
            <p className="text-[13px] uppercase tracking-[0.18em] text-[#F0EFEC]/40">Ganhador</p>
            <p className="mt-4 text-[42px] font-medium leading-tight text-[#F0EFEC]">{winner.name}</p>
            <p className="mt-3 text-[14px] text-[#F0EFEC]/42">
              {winner.chances} {winner.chances === 1 ? 'vale' : 'vales'} · {winner.phoneFormatted}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-8 h-11 rounded-[10px] bg-[#F0EFEC] px-6 text-[14px] text-[#111111]"
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
