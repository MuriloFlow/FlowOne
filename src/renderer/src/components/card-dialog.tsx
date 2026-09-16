import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { parseBRLToCents, formatBRLInput } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import type { CardRecord, CardWriteInput, StoreOption, StorePerson } from '../../../shared/operations'

type CardDialogProps = {
  open: boolean
  mode: 'create' | 'edit' | 'transfer'
  card?: CardRecord | null
  stores: StoreOption[]
  people: StorePerson[]
  defaultStoreId?: string | null
  lockedDateKey?: string | null
  onClose: () => void
  onSaved: (card: CardRecord) => void
}

export function CardDialog({
  open,
  mode,
  card,
  stores,
  people,
  defaultStoreId = null,
  lockedDateKey = null,
  onClose,
  onSaved
}: CardDialogProps) {
  const [storeId, setStoreId] = useState('')
  const [collaboratorId, setCollaboratorId] = useState('')
  const [clientName, setClientName] = useState('')
  const [limitText, setLimitText] = useState('')
  const [usedText, setUsedText] = useState('')
  const [activated, setActivated] = useState(false)
  const [dateKey, setDateKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setStoreId(card?.storeId || defaultStoreId || stores[0]?.id || '')
    setCollaboratorId(card?.collaboratorId || people[0]?.id || '')
    setClientName(card?.clientName ?? '')
    setLimitText(card ? formatBRLInput(card.amountInCents) : '')
    setUsedText(card ? formatBRLInput(card.amountUsedInCents) : '0,00')
    setActivated(card?.activated ?? false)
    setDateKey(
      card?.dateKey ??
        lockedDateKey ??
        new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    )
  }, [open, card, defaultStoreId, stores, people, lockedDateKey])

  const storeOptions = useMemo(
    () => stores.map((item) => ({ value: item.id, label: item.name })),
    [stores]
  )
  const peopleOptions = useMemo(
    () => people.map((item) => ({ value: item.id, label: item.name })),
    [people]
  )

  const title =
    mode === 'create' ? 'Registrar cartão' : mode === 'transfer' ? 'Transferir cartão' : 'Editar cartão'
  const description =
    mode === 'transfer'
      ? 'O cartão continua no Card+, só muda o funcionário responsável.'
      : lockedDateKey
        ? 'Esse cartão entra no Card+ já nessa data.'
        : 'O registro vai direto para o Card+, com limite, gasto e status.'

  async function submit(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'transfer') {
        if (!card) throw new Error('Cartão é obrigatório.')
        onSaved(await operations().transferCard(card.id, collaboratorId))
        onClose()
        return
      }
      const payload: CardWriteInput = {
        id: card?.id,
        storeId,
        collaboratorId,
        clientName,
        amountInCents: parseBRLToCents(limitText),
        amountUsedInCents: parseBRLToCents(usedText),
        activated,
        dateKey
      }
      const saved = mode === 'create' ? await operations().createCard(payload) : await operations().updateCard(payload)
      onSaved(saved)
      onClose()
    } catch (saveError) {
      setError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} title={title} description={description} onClose={onClose}>
      <div className="space-y-3 px-5 pb-5">
        {mode !== 'transfer' ? (
          <>
            {storeOptions.length > 1 ? (
              <label className="grid gap-1.5">
                <Label>Unidade</Label>
                <Select value={storeId} options={storeOptions} onChange={setStoreId} />
              </label>
            ) : null}
            <label className="grid gap-1.5">
              <Label>Cliente</Label>
              <Input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nome" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <Label>Limite</Label>
                <Input value={limitText} onChange={(event) => setLimitText(event.target.value)} placeholder="0,00" />
              </label>
              <label className="grid gap-1.5">
                <Label>Gasto</Label>
                <Input value={usedText} onChange={(event) => setUsedText(event.target.value)} placeholder="0,00" />
              </label>
            </div>
            {lockedDateKey ? null : (
              <label className="grid gap-1.5">
                <Label>Data</Label>
                <Input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} />
              </label>
            )}
            <label className="flex items-center gap-2 text-[13px] text-[#F0EFEC]/65">
              <input
                type="checkbox"
                checked={activated}
                onChange={(event) => setActivated(event.target.checked)}
                className="size-3.5 accent-[#F0EFEC]"
              />
              Cartão ativado
            </label>
          </>
        ) : null}

        <label className="grid gap-1.5">
          <Label>Funcionário</Label>
          <Select value={collaboratorId} options={peopleOptions} onChange={setCollaboratorId} />
        </label>

        {error ? <p className="text-[13px] text-red-300/80">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 hover:bg-white/[0.04]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !collaboratorId || (mode !== 'transfer' && !clientName.trim())}
            onClick={() => void submit()}
            className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111] disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {mode === 'create' ? 'Registrar' : 'Salvar'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
