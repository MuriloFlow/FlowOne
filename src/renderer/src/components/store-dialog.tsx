import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type { StoreBoardItem, StorePerson, StoreWriteInput } from '../../../shared/operations'

type StoreDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  store?: StoreBoardItem | null
  people: StorePerson[]
  onClose: () => void
  onSaved: (store: StoreBoardItem) => void
}

export function StoreDialog({ open, mode, store, people, onClose, onSaved }: StoreDialogProps) {
  const [name, setName] = useState('')
  const [internalCode, setInternalCode] = useState('')
  const [notes, setNotes] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [generalManagerId, setGeneralManagerId] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [operationLeadId, setOperationLeadId] = useState('')
  const [managerIds, setManagerIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setName(store?.name ?? '')
    setInternalCode(store?.internalCode ?? '')
    setNotes(store?.notes ?? '')
    setFlagged(store?.flagged ?? false)
    setGeneralManagerId(store?.generalManager?.id ?? '')
    setSupervisorId(store?.supervisor?.id ?? '')
    setOperationLeadId(store?.operationLead?.id ?? '')
    setManagerIds(store?.managers.map((item) => item.id) ?? [])
  }, [open, store])

  const personOptions = useMemo(
    () => [{ value: '', label: 'Ninguém definido' }, ...people.map((item) => ({ value: item.id, label: item.name }))],
    [people]
  )

  function toggleManager(id: string): void {
    setManagerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function submit(): Promise<void> {
    setSaving(true)
    setError(null)
    const payload: StoreWriteInput = {
      id: store?.id,
      name,
      internalCode,
      notes,
      flagged,
      managerIds,
      generalManagerId: generalManagerId || null,
      supervisorId: supervisorId || null,
      operationLeadId: operationLeadId || null
    }
    try {
      const saved = mode === 'create' ? await operations().createStore(payload) : await operations().updateStore(payload)
      onSaved(saved)
      onClose()
    } catch (saveError) {
      setError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      wide
      title={mode === 'create' ? 'Cadastrar unidade' : 'Mesa da unidade'}
      description="O nome vai para o Card+. Liderança, código e observação ficam só no FLOW."
      onClose={onClose}
    >
      <div className="max-h-[70vh] space-y-4 overflow-auto px-5 pb-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 grid gap-1.5">
            <Label>Nome da unidade</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Loja 03" />
          </label>
          <label className="grid gap-1.5">
            <Label>Código interno</Label>
            <Input
              value={internalCode}
              onChange={(event) => setInternalCode(event.target.value)}
              placeholder="Opcional"
              maxLength={24}
            />
          </label>
          <label className="flex items-end gap-2 pb-1 text-[13px] text-[#F0EFEC]/60">
            <input
              type="checkbox"
              checked={flagged}
              onChange={(event) => setFlagged(event.target.checked)}
              className="size-3.5 accent-[#F0EFEC]"
            />
            Marcar atenção
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <label className="grid gap-1.5">
            <Label>Gerente geral</Label>
            <Select value={generalManagerId} options={personOptions} onChange={setGeneralManagerId} />
          </label>
          <label className="grid gap-1.5">
            <Label>Supervisor</Label>
            <Select value={supervisorId} options={personOptions} onChange={setSupervisorId} />
          </label>
          <label className="grid gap-1.5">
            <Label>Líder de operação</Label>
            <Select value={operationLeadId} options={personOptions} onChange={setOperationLeadId} />
          </label>
        </div>

        <div>
          <Label>Gerentes da unidade</Label>
          <div className="mt-2 max-h-36 overflow-auto rounded-[10px] border border-white/[0.06] p-2">
            {people.length === 0 ? (
              <p className="px-1 py-2 text-[12px] text-[#F0EFEC]/35">Cadastre funcionários para atribuir gerentes.</p>
            ) : (
              people.map((person) => {
                const checked = managerIds.includes(person.id)
                return (
                  <label
                    key={person.id}
                    className={cn(
                      'flex h-8 items-center gap-2 rounded-[8px] px-2 text-[13px] text-[#F0EFEC]/70',
                      checked ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleManager(person.id)}
                      className="size-3.5 accent-[#F0EFEC]"
                    />
                    {person.name}
                  </label>
                )
              })
            )}
          </div>
        </div>

        <label className="grid gap-1.5">
          <Label>Observação interna</Label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Somente para gestão. Não vai para o Card+."
            className="min-h-[84px] resize-none rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-[#F0EFEC]/80 outline-none placeholder:text-[#F0EFEC]/28 focus:border-white/16"
          />
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
            disabled={saving || !name.trim()}
            onClick={() => void submit()}
            className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111] disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {mode === 'create' ? 'Cadastrar' : 'Salvar'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
