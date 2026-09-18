import { useEffect, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'
import logo from '@/assets/logo.png'
import type { WindowState } from '../../../shared/ipc'

export function Titlebar({ branded = true, overlay = false }: { branded?: boolean; overlay?: boolean }) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!window.flow) return
    let mounted = true
    void window.flow.window.getState().then((state: WindowState) => {
      if (mounted) setIsMaximized(state.isMaximized)
    })
    const unsubscribe = window.flow.window.onState((state: WindowState) => {
      setIsMaximized(state.isMaximized)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return (
    <header
      className={
        overlay
          ? 'absolute inset-x-0 top-0 z-20 flex h-8 items-stretch bg-transparent select-none'
          : 'relative z-20 flex h-8 shrink-0 items-stretch bg-[#111111] select-none'
      }
    >
      <div className="titlebar-drag flex min-w-0 flex-1 items-center px-3">
        {branded ? (
          <img src={logo} alt="FLOW" className="h-3.5 w-auto object-contain opacity-90" />
        ) : null}
      </div>
      <div className="flex">
        <button
          type="button"
          aria-label="Minimizar"
          className="titlebar-no-drag flex h-8 w-11 items-center justify-center text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          onClick={() => void window.flow.window.minimize()}
        >
          <Minus className="size-3.5" strokeWidth={1.6} />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? 'Restaurar' : 'Maximizar'}
          className="titlebar-no-drag flex h-8 w-11 items-center justify-center text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          onClick={() => void window.flow.window.toggleMaximize()}
        >
          {isMaximized ? (
            <Copy className="size-3 rotate-90" strokeWidth={1.6} />
          ) : (
            <Square className="size-3" strokeWidth={1.6} />
          )}
        </button>
        <button
          type="button"
          aria-label="Fechar"
          className="titlebar-no-drag flex h-8 w-11 items-center justify-center text-white/70 transition-colors hover:bg-[#c42b1c] hover:text-white"
          onClick={() => void window.flow.window.close()}
        >
          <X className="size-3.5" strokeWidth={1.6} />
        </button>
      </div>
    </header>
  )
}
