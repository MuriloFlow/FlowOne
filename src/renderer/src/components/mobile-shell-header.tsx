import { Menu } from 'lucide-react'
import logo from '@/assets/logo.png'

type MobileShellHeaderProps = {
  title: string
  onOpenNav: () => void
}

export function MobileShellHeader({ title, onOpenNav }: MobileShellHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.04] bg-[#111111] px-1">
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={onOpenNav}
        className="flex size-11 shrink-0 items-center justify-center text-[#F0EFEC]/85"
      >
        <Menu className="size-5" strokeWidth={1.7} />
      </button>
      <img src={logo} alt="FLOW" className="h-4 w-auto object-contain object-left py-0.5 opacity-90" />
      <span className="min-w-0 flex-1 truncate pr-3 text-[13px] font-medium text-[#F0EFEC]/70">{title}</span>
    </header>
  )
}
