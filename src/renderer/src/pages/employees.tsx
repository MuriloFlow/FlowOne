import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Settings, Trash2, UserRound } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { EmployeeDialog } from '@/components/employee-dialog'
import { Input } from '@/components/ui/input'
import { initials } from '@/lib/identity'
import { refreshAuthUser } from '@/lib/auth'
import { operationError, operations } from '@/lib/operations'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { EmployeeListItem, StoreOption } from '../../../shared/operations'

type EmployeesPageProps = {
  storeId?: string | null
  onOpenProfile: (id: string) => void
}

export function EmployeesPage({ storeId = null, onOpenProfile }: EmployeesPageProps) {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeListItem | null>(null)
  const [removing, setRemoving] = useState<EmployeeListItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([operations().listEmployees(storeId), operations().listStores()])
      .then(([list, storeList]) => {
        if (!active) return
        setEmployees(list)
        setStores(storeList)
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
  }, [storeId])

  const filtered = useMemo(() => {
    const scoped = storeId
      ? employees.filter((employee) => employee.storeId === storeId || employee.isGlobalDesk)
      : employees
    const term = query.trim().toLowerCase()
    if (!term) return scoped
    return scoped.filter((employee) =>
      [employee.name, employee.storeName, employee.flowRoleLabel, employee.cardplusRole, employee.cpfMasked ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [employees, query, storeId])

  function openCreate(): void {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(employee: EmployeeListItem): void {
    setEditing(employee)
    setDialogOpen(true)
  }

  async function reloadDirectory(): Promise<void> {
    const [list, storeList] = await Promise.all([operations().listEmployees(storeId), operations().listStores()])
    setEmployees(list)
    setStores(storeList)
  }

  async function confirmDelete(): Promise<void> {
    if (!removing) return
    setDeleting(true)
    try {
      await operations().deleteEmployee(removing.id, storeId)
      setEmployees((current) => current.filter((item) => item.id !== removing.id))
      setRemoving(null)
    } catch (deleteError) {
      setError(operationError(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  function onSaved(): void {
    void Promise.all([reloadDirectory(), refreshAuthUser()]).catch((reloadError) =>
      setError(operationError(reloadError))
    )
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
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] text-[#F0EFEC]/88">Funcionários</h1>
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
            {storeId
              ? 'Somente funcionários da unidade selecionada.'
              : 'Um cargo FLOW por pessoa. A função operacional grava no Card+. Conta TI da rede é só o login, não o cargo.'}
          </p>
        </div>
        {employees.length > 0 ? (
          <button
            type="button"
            onClick={openCreate}
            className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
          >
            Cadastrar funcionário
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      {employees.length === 0 ? (
        <EmptyEmployees onCreate={openCreate} />
      ) : (
        <section className="mb-[4.5rem] flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, unidade ou cargo"
              className="h-8 max-w-sm rounded-[8px] border-white/[0.06] bg-transparent text-[13px]"
            />
            <span className="text-[12px] text-[#F0EFEC]/32">
              {formatCount(filtered.length)} {filtered.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#1A1A1A] text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                <tr className="border-y border-white/[0.04]">
                  <th className="px-5 py-2.5 font-medium">Funcionário</th>
                  <th className="px-3 py-2.5 font-medium">CPF</th>
                  <th className="px-3 py-2.5 font-medium">Unidade</th>
                  <th className="px-3 py-2.5 font-medium">Cargo FLOW</th>
                  <th className="px-3 py-2.5 font-medium">Cartões no mês</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="w-[112px] px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-t border-white/[0.03] text-[13px] transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[11px] text-[#F0EFEC]/55">
                          {initials(employee.name)}
                        </span>
                        <span>
                          <span className="block text-[#F0EFEC]/82">{employee.name}</span>
                          <span className="mt-0.5 block text-[11px] text-[#F0EFEC]/32">
                            {employee.cardplusRole}
                            {employee.globalDeskLabel
                              ? ` · Conta ${employee.globalDeskLabel} da rede`
                              : employee.directorySource === 'app_user'
                                ? ' · Conta da rede'
                                : ''}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#F0EFEC]/62">
                      {employee.cpfMasked ?? <span className="text-[#F0EFEC]/28">Não cadastrado</span>}
                    </td>
                    <td className="px-3 py-3 text-[#F0EFEC]/55">{employee.storeName}</td>
                    <td className="px-3 py-3 text-[#F0EFEC]/70">{employee.flowRoleLabel}</td>
                    <td className="px-3 py-3 text-[#F0EFEC]/70">{formatCount(employee.cardsThisMonth)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[#F0EFEC]/60">
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            employee.isActive ? 'bg-[#34D399]' : 'bg-[#F0EFEC]/25'
                          )}
                        />
                        {employee.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {employee.directorySource === 'app_user' ? (
                          <IconButton label="Editar" onClick={() => openEdit(employee)}>
                            <Settings className="size-3.5" strokeWidth={1.7} />
                          </IconButton>
                        ) : (
                          <>
                            <IconButton label="Editar" onClick={() => openEdit(employee)}>
                              <Settings className="size-3.5" strokeWidth={1.7} />
                            </IconButton>
                            <IconButton label="Perfil" onClick={() => onOpenProfile(employee.id)}>
                              <UserRound className="size-3.5" strokeWidth={1.7} />
                            </IconButton>
                            {employee.name.trim().toUpperCase() === 'CAIXA' ? null : (
                              <IconButton label="Excluir" onClick={() => setRemoving(employee)}>
                                <Trash2 className="size-3.5" strokeWidth={1.7} />
                              </IconButton>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <EmployeeDialog
        open={dialogOpen}
        mode={editing ? 'edit' : 'create'}
        employee={editing}
        stores={stores}
        defaultStoreId={storeId}
        onClose={() => setDialogOpen(false)}
        onSaved={onSaved}
      />

      <Dialog
        open={Boolean(removing)}
        title="Excluir funcionário"
        description="Os cartões dele no Card+ passam para o CAIXA. Depois o cadastro some do Card+ e do FLOW."
        onClose={() => {
          if (!deleting) setRemoving(null)
        }}
      >
        <div className="px-5 pb-5">
          <p className="text-[13px] text-[#F0EFEC]/55">
            Excluir <span className="text-[#F0EFEC]/80">{removing?.name}</span>? Essa ação não tem volta.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setRemoving(null)}
              className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 hover:bg-white/[0.04]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void confirmDelete()}
              className="h-8 rounded-[8px] bg-red-500/90 px-3.5 text-[13px] text-white disabled:opacity-40"
            >
              {deleting ? 'Excluindo…' : 'Excluir'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function IconButton({
  label,
  children,
  onClick
}: {
  label: string
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-[8px] text-[#F0EFEC]/38 transition-colors hover:bg-white/[0.05] hover:text-[#F0EFEC]/75"
    >
      {children}
    </button>
  )
}

function EmptyEmployees({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
      <div className="mb-5 flex size-[88px] items-center justify-center rounded-full bg-white/[0.03]">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
          <circle cx="16" cy="15" r="5" stroke="#F0EFEC" strokeOpacity="0.28" strokeWidth="1.6" />
          <path d="M7 31c1.4-5 5-7.5 9-7.5s7.6 2.5 9 7.5" stroke="#F0EFEC" strokeOpacity="0.28" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="30" cy="16" r="4" stroke="#F0EFEC" strokeOpacity="0.18" strokeWidth="1.6" />
          <path d="M26.5 30.5c.8-3.4 3.2-5.1 6-5.1" stroke="#F0EFEC" strokeOpacity="0.18" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-[16px] text-[#F0EFEC]/78">Ainda não possui funcionários cadastrados</h2>
      <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-[#F0EFEC]/38">
        Os funcionários vêm do Card+. Quando houver cadastro, o CPF e o cargo FLOW entram por aqui.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
      >
        Cadastrar funcionário
      </button>
    </div>
  )
}
