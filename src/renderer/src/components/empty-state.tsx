import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon: ReactNode
  title: string
  description?: string
  actionLabel: string
  onAction: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-white/[0.04] text-[#F0EFEC]/32">
        {icon}
      </div>
      <h2 className="text-[15px] text-[#F0EFEC]/78">{title}</h2>
      {description ? (
        <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-[#F0EFEC]/38">{description}</p>
      ) : null}
      <button
        type="button"
        onClick={onAction}
        className="mt-5 h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
      >
        {actionLabel}
      </button>
    </div>
  )
}
