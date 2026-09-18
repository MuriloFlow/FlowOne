import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Eye, EyeOff, Loader2, Settings } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { initials } from '@/lib/identity'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { operationError, operations } from '@/lib/operations'
import { canLoginWithRole, FLOW_ROLES, isFlowRole, needsStoreBinding, type FlowRoleId } from '@/lib/roles'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FlowLauncherUser, StoreOption } from '../../../shared/operations'

const ROLE_OPTIONS = FLOW_ROLES.filter((role) => role.canLogin).map((role) => ({
  value: role.id,
  label: role.label
}))

export function UsersPage() {
  const [users, setUsers] = useState<FlowLauncherUser[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FlowLauncherUser | null>(null)

  async function reload(): Promise<void> {
    const [list, storeList] = await Promise.all([operations().listFlowUsers(), operations().listStores()])
    setUsers(list)
    setStores(storeList)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    void reload()
      .then(() => {
        if (!active) return
        setError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setError(operationError(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return users
    return users.filter((user) =>
      [user.displayName, user.email, user.roleLabel, user.storeName ?? ''].join(' ').toLowerCase().includes(term)
    )
  }, [users, query])

  const mobile = isMobileShell()

  function openCreate(): void {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(user: FlowLauncherUser): void {
    setEditing(user)
    setDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-6 h-8 w-48 animate-pulse rounded-full bg-white/5" />
        <div className="min-h-0 flex-1 animate-pulse rounded-[16px] bg-white/4" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header
        className={
          mobile ? 'mb-4 flex flex-col gap-3' : 'mb-5 flex items-end justify-between gap-4'
        }
      >
        <div className="min-w-0">
          <h1 className="text-[22px] text-[#F0EFEC]/88">Usuários</h1>
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
            {mobile
              ? 'Toque na pessoa para editar o acesso.'
              : 'Acessos do launcher FLOW: e-mail, senha, cargo e unidade. Não mistura com login do Card+.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className={
            mobile
              ? 'flex h-11 w-full shrink-0 items-center justify-center rounded-[10px] bg-[#F0EFEC] text-[14px] text-[#111111]'
              : 'h-8 shrink-0 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]'
          }
        >
          Novo acesso
        </button>
      </header>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      <section
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]',
          !mobile && 'mb-[4.5rem]'
        )}
      >
        <div className={mobile ? 'flex items-center gap-3 px-3 py-3' : 'flex items-center justify-between gap-3 px-4 py-3'}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mobile ? 'Buscar usuário' : 'Buscar por nome, e-mail ou cargo'}
            className="h-8 min-w-0 flex-1 rounded-[8px] border-white/[0.06] bg-transparent text-[13px] max-w-sm"
          />
          <span className="shrink-0 text-[12px] text-[#F0EFEC]/32">
            {formatCount(filtered.length)} {filtered.length === 1 ? 'acesso' : 'acessos'}
          </span>
        </div>
        {mobile ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => openEdit(user)}
                className="flex min-h-14 w-full items-center gap-3 border-t border-white/[0.03] px-3 py-2.5 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[12px] text-[#F0EFEC]/55">
                  {initials(user.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[#F0EFEC]/85">{user.displayName}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[#F0EFEC]/38">{user.email}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-[#F0EFEC]/28" strokeWidth={1.8} />
              </button>
            ))}
          </div>
        ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[#1A1A1A] text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
              <tr className="border-y border-white/[0.04]">
                <th className="px-5 py-2.5 font-medium">Usuário</th>
                <th className="px-3 py-2.5 font-medium">Cargo FLOW</th>
                <th className="px-3 py-2.5 font-medium">Unidade</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="w-[56px] px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-t border-white/[0.03] text-[13px] hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[11px] text-[#F0EFEC]/55">
                        {initials(user.displayName)}
                      </span>
                      <span>
                        <span className="block text-[#F0EFEC]/82">{user.displayName}</span>
                        <span className="mt-0.5 block text-[11px] text-[#F0EFEC]/32">{user.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[#F0EFEC]/70">{user.roleLabel}</td>
                  <td className="px-3 py-3 text-[#F0EFEC]/55">{user.storeName}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[#F0EFEC]/60">
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          user.status === 'active' ? 'bg-[#34D399]' : 'bg-[#F0EFEC]/25'
                        )}
                      />
                      {user.status === 'active' ? 'Ativo' : user.status === 'locked' ? 'Bloqueado' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(user)}
                      className="flex size-7 items-center justify-center rounded-[8px] text-[#F0EFEC]/35 hover:bg-white/[0.04] hover:text-[#F0EFEC]/70"
                      aria-label="Editar"
                    >
                      <Settings className="size-3.5" strokeWidth={1.7} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>

      <UserDialog
        open={dialogOpen}
        user={editing}
        stores={stores}
        onClose={() => setDialogOpen(false)}
        onSaved={(saved) => {
          setUsers((current) => {
            const exists = current.some((item) => item.id === saved.id)
            if (!exists) return [...current, saved].sort((left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR'))
            return current.map((item) => (item.id === saved.id ? saved : item))
          })
          setDialogOpen(false)
        }}
      />
    </div>
  )
}

function UserDialog({
  open,
  user,
  stores,
  onClose,
  onSaved
}: {
  open: boolean
  user: FlowLauncherUser | null
  stores: StoreOption[]
  onClose: () => void
  onSaved: (user: FlowLauncherUser) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<FlowRoleId>('LIDER_OPERACAO')
  const [storeId, setStoreId] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsStore = needsStoreBinding(role)

  useEffect(() => {
    if (!open) return
    setDisplayName(user?.displayName ?? '')
    setEmail(user?.email ?? '')
    setRole(user?.role && isFlowRole(user.role) && canLoginWithRole(user.role) ? user.role : 'LIDER_OPERACAO')
    setStoreId(user?.storeId ?? stores[0]?.id ?? '')
    setStatus(user?.status === 'inactive' ? 'inactive' : 'active')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setError(null)
    setSaving(false)
  }, [open, user, stores])

  async function submit(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      if (!user && password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')
      if (password && password !== confirmPassword) throw new Error('As senhas não coincidem.')
      const saved = await operations().upsertFlowUser({
        id: user?.id,
        email,
        displayName,
        role,
        password: password || undefined,
        storeId: needsStore ? storeId : null,
        status
      })
      onSaved(saved)
    } catch (submitError) {
      setError(operationError(submitError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={user ? 'Editar acesso' : 'Novo acesso do FLOW'}
      description="E-mail e senha entram no launcher. Cargo FLOW define o que a pessoa vê. Login do Card+ continua separado."
      onClose={onClose}
    >
      <div className="space-y-3.5 px-5 pb-5">
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">Nome</Label>
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Nome completo"
            className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">E-mail</Label>
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nome@empresa.com"
            autoComplete="off"
            className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Cargo FLOW</Label>
            <Select
              value={role}
              options={ROLE_OPTIONS}
              onChange={(value) => {
                if (isFlowRole(value) && canLoginWithRole(value)) setRole(value)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Status</Label>
            <Select
              value={status}
              options={[
                { value: 'active', label: 'Ativo' },
                { value: 'inactive', label: 'Inativo' }
              ]}
              onChange={(value) => setStatus(value === 'inactive' ? 'inactive' : 'active')}
            />
          </div>
        </div>
        {needsStore ? (
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Unidade</Label>
            <Select
              value={storeId}
              options={stores.map((store) => ({ value: store.id, label: store.name }))}
              placeholder="Selecionar unidade"
              onChange={setStoreId}
            />
          </div>
        ) : (
          <p className="text-[12px] text-[#F0EFEC]/38">Este cargo vê todas as unidades no launcher.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">{user ? 'Nova senha' : 'Senha'}</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={user ? 'Deixe vazio para manter' : 'Mínimo 8 caracteres'}
                autoComplete="new-password"
                className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] pr-10 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-[#F0EFEC]/35"
              >
                {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Confirmar senha</Label>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repita a senha"
              autoComplete="new-password"
              className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
            />
          </div>
        </div>
        {error ? <p className="text-[12px] text-red-400/80">{error}</p> : null}
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
            disabled={saving || !displayName.trim() || !email.trim() || (needsStore && !storeId)}
            onClick={() => void submit()}
            className="inline-flex h-8 items-center justify-center rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111] disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : user ? 'Salvar' : 'Criar acesso'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
