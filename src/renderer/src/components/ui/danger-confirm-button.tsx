import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type DangerConfirmButtonProps = {
  loading: boolean
  children: string
  onClick: () => void
}

export function DangerConfirmButton({ loading, children, onClick }: DangerConfirmButtonProps) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 min-w-[108px] items-center justify-center gap-1.5 rounded-[8px] bg-red-400/90 px-3.5 text-[13px] text-[#111111]',
        loading && 'opacity-80'
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
      <span>{children}</span>
    </button>
  )
}
