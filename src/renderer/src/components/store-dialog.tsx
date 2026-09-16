import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type {
  StoreAccessAccount,
  StoreBoardItem,
  StorePerson,
  StoreWriteInput
} from '../../../shared/operations'

type StoreDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  store?: StoreBoardItem | null
  people: StorePerson[]
  onClose: () => void
  onSaved: (store: StoreBoardItem) => void
}

function suggestUsername(name: string): string {
  const digits = name.match(/\d+/g)?.join('')
  if (digits) return `operacao.${digits}`
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
    .split('.')
    .find(Boolean)
  return slug ? `operacao.${slug}` : 'operacao'
}

export function StoreDialog({ open, mode, store, people, onClose, onSaved }: StoreDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [internalCode, setInternalCode] = useState('')
  const [notes, setNotes] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [generalManagerId, setGeneralManagerId] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [operationLeadId, setOperationLeadId] = useState('')
  const [managerIds, setManagerIds] = useState<string[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accounts, setAccounts] = useState<StoreAccessAccount[]>([])
  const [editingAccessId, setEditingAccessId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingAccess, setLoadingAccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setStep(1)
    setName(store?.name ?? '')
    setInternalCode(store?.internalCode ?? '')
    setNotes(store?.notes ?? '')
    setFlagged(store?.flagged ?? false)
    setGeneralManagerId(store?.generalManager?.id ?? '')
    setSupervisorId(store?.supervisor?.id ?? '')
    setOperationLeadId(store?.operationLead?.id ?? '')
    setManagerIds(store?.managers.map((item) => item.id) ?? [])
    setUsername(store ? '' : '')
    setPassword('')
    setConfirmPassword('')
    setDisplayName('')
    setShowPassword(false)
    setEditingAccessId(null)
    setAccounts([])
    if (mode === 'edit' && store) {
      setLoadingAccess(true)
      void operations()
        .listStoreAccess(store.id)
        .then(setAccounts)
        .catch((loadError) => setError(operationError(loadError)))
        .finally(() => setLoadingAccess(false))
    }
  }, [open, store, mode])

  useEffect(() => {
    if (mode !== 'create' || !open || step !== 2) return
    if (username.trim()) return
    setUsername(suggestUsername(name))
    if (!displayName.trim()) setDisplayName(`Operadores - ${name.trim()}`)
  }, [mode, open, step, name, username, displayName])

  const personOptions = useMemo(
    () => [{ value: '', label: 'Ninguém definido' }, ...people.map((item) => ({ value: item.id, label: item.name }))],
    [people]
  )

  function toggleManager(id: string): void {
    setManagerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function deskPayload(): StoreWriteInput {
    return {
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
  }

  async function saveDesk(): Promise<StoreBoardItem> {
    return operations().updateStore(deskPayload())
  }

  async function submitCreate(): Promise<void> {
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await operations().createStore({
        ...deskPayload(),
        accessUsername: username,
        accessPassword: password,
        accessDisplayName: displayName
      })
      onSaved(saved)
      onClose()
    } catch (saveError) {
      setError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function submitDesk(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      onSaved(await saveDesk())
      onClose()
    } catch (saveError) {
      setError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function submitAccess(): Promise<void> {
    if (!store) return
    if (!editingAccessId && password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    if (editingAccessId && password && password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await operations().upsertStoreAccess({
        storeId: store.id,
        id: editingAccessId ?? undefined,
        username,
        displayName,
        password: password || undefined
      })
      setAccounts((current) => {
        const exists = current.some((item) => item.id === saved.id)
        return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved]
      })
      setUsername('')
      setPassword('')
      setConfirmPassword('')
      setDisplayName('')
      setEditingAccessId(null)
    } catch (saveError) {
      setError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function toggleAccess(account: StoreAccessAccount): Promise<void> {
    if (!store) return
    try {
      const saved = await operations().upsertStoreAccess({
        storeId: store.id,
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        isActive: !account.isActive
      })
      setAccounts((current) => current.map((item) => (item.id === saved.id ? saved : item)))
    } catch (saveError) {
      setError(operationError(saveError))
    }
  }

  const title = mode === 'create' ? (step === 1 ? 'Cadastrar unidade' : 'Login operacional') : step === 1 ? 'Mesa da unidade' : 'Acessos do Card+'
  const description =
    mode === 'create' && step === 1
      ? 'O nome vai para o Card+. No próximo passo você cria o login dos operadores.'
      : mode === 'create'
        ? 'Esse login entra no Card+ para os funcionários operacionais da unidade.'
        : step === 1
          ? 'O nome vai para o Card+. Liderança e observação ficam só no FLOW.'
          : 'Altere login, senha ou desative o acesso operacional desta loja.'

  return (
    <Dialog open={open} wide title={title} description={description} onClose={onClose}>
      <div className="max-h-[70vh] space-y-4 overflow-auto px-5 pb-5">
        <div className="flex gap-2">
          <StepChip active={step === 1} onClick={() => setStep(1)}>
            1. Unidade
          </StepChip>
          <StepChip active={step === 2} onClick={() => (mode === 'create' && !name.trim() ? undefined : setStep(2))}>
            2. Login e senha
          </StepChip>
        </div>

        {step === 1 ? (
          <>
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
          </>
        ) : (
          <>
            {mode === 'edit' ? (
              <div className="space-y-2">
                {loadingAccess ? (
                  <p className="text-[13px] text-[#F0EFEC]/38">Carregando acessos…</p>
                ) : accounts.length === 0 ? (
                  <p className="text-[13px] text-[#F0EFEC]/38">Nenhum login operacional nesta unidade.</p>
                ) : (
                  accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between gap-3 rounded-[10px] border border-white/[0.06] px-3 py-2"
                    >
                      <div>
                        <p className="text-[13px] text-[#F0EFEC]/80">{account.username}</p>
                        <p className="text-[11px] text-[#F0EFEC]/36">
                          {account.displayName} · {account.roleLabel}
                          {account.isActive ? '' : ' · inativo'}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAccessId(account.id)
                            setUsername(account.username)
                            setDisplayName(account.displayName)
                            setPassword('')
                            setConfirmPassword('')
                          }}
                          className="h-7 rounded-[7px] px-2 text-[12px] text-[#F0EFEC]/55 hover:bg-white/[0.05]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleAccess(account)}
                          className="h-7 rounded-[7px] px-2 text-[12px] text-[#F0EFEC]/55 hover:bg-white/[0.05]"
                        >
                          {account.isActive ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3">
              <label className="grid gap-1.5">
                <Label>Login</Label>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="operacao.03"
                  autoComplete="off"
                />
              </label>
              <label className="grid gap-1.5">
                <Label>Nome no Card+</Label>
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={`Operadores - ${name || 'unidade'}`}
                />
              </label>
              <label className="grid gap-1.5">
                <Label>{editingAccessId ? 'Nova senha' : 'Senha'}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={editingAccessId ? 'Deixe vazio para manter' : 'Mínimo 6 caracteres'}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-[#F0EFEC]/35"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </label>
              <label className="grid gap-1.5">
                <Label>Confirmar senha</Label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                />
              </label>
            </div>
          </>
        )}

        {error ? <p className="text-[13px] text-red-300/80">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 hover:bg-white/[0.04]"
          >
            Cancelar
          </button>
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/55 hover:bg-white/[0.04]"
            >
              Voltar
            </button>
          ) : null}
          {mode === 'edit' && step === 1 ? (
            <button
              type="button"
              disabled={saving || !name.trim()}
              onClick={() => void submitDesk()}
              className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111] disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Salvar
            </button>
          ) : null}
          {step === 1 ? (
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => setStep(2)}
              className="h-8 rounded-[8px] bg-white/[0.08] px-3.5 text-[13px] text-[#F0EFEC]/80 disabled:opacity-40"
            >
              Próximo
            </button>
          ) : mode === 'create' ? (
            <button
              type="button"
              disabled={saving || !username.trim() || password.length < 6}
              onClick={() => void submitCreate()}
              className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111] disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Cadastrar
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !username.trim() || (!editingAccessId && password.length < 6)}
              onClick={() => void submitAccess()}
              className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111] disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {editingAccessId ? 'Atualizar acesso' : 'Criar acesso'}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function StepChip({
  active,
  children,
  onClick
}: {
  active: boolean
  children: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 rounded-full px-2.5 text-[11px]',
        active ? 'bg-white/[0.08] text-[#F0EFEC]/80' : 'text-[#F0EFEC]/32'
      )}
    >
      {children}
    </button>
  )
}
