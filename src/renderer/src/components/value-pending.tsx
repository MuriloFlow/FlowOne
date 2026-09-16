import { cn } from '@/lib/utils'

type ValuePendingProps = {
  size?: 'lg' | 'sm'
  className?: string
}

export function ValuePending({ size = 'lg', className }: ValuePendingProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block animate-pulse rounded-md bg-[#F0EFEC]/10',
        size === 'lg' ? 'h-7 w-[7.2rem]' : 'h-3.5 w-14',
        className
      )}
    />
  )
}
