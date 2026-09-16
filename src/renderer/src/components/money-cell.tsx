import { useEffect, useState } from 'react'
import { formatBRLFromCents, formatBRLInput, parseBRLToCents } from '@/lib/format'

type MoneyCellProps = {
  cents: number
  onSave: (cents: number) => Promise<void> | void
}

export function MoneyCell({ cents, onSave }: MoneyCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(formatBRLInput(cents))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(formatBRLInput(cents))
  }, [cents, editing])

  async function commit(): Promise<void> {
    const next = parseBRLToCents(draft)
    setEditing(false)
    if (next === cents) return
    setSaving(true)
    try {
      await onSave(next)
    } catch {
      setDraft(formatBRLInput(cents))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void commit()
          if (event.key === 'Escape') setEditing(false)
        }}
        className="h-8 w-[108px] rounded-[8px] border border-white/12 bg-white/[0.04] px-2 text-[13px] text-[#F0EFEC]/80 outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => setEditing(true)}
      className="h-8 rounded-[8px] px-2 text-left text-[13px] text-[#F0EFEC]/70 transition-colors hover:bg-white/[0.04]"
    >
      {formatBRLFromCents(cents)}
    </button>
  )
}
