import { useEffect, useMemo, useState } from 'react'
import { Flag, LayoutDashboard, Settings, Users } from 'lucide-react'
import { StoreDialog } from '@/components/store-dialog'
import { Input } from '@/components/ui/input'
import { ValuePending } from '@/components/value-pending'
import { formatBRLFromCents, formatCount } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type { StoreBoard, StoreBoardItem } from '../../../shared/operations'

type FilterId = 'all' | 'flagged' | 'gap'

type StoresPageProps = {
  storeId?: string | null
  onOpenOperation?: (storeId: string) => void
  onOpenTeam?: (storeId: string) => void
  onDeskChanged?: () => void
}

export function StoresPage({ storeId = null, onOpenOperation, onOpenTeam, onDeskChanged }: StoresPageProps) {
  const [board, setBoard] = useState<StoreBoard | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StoreBoardItem | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    void operations()
      .listStoreBoard(storeId)
      .then((payload) => {
        if (!active) return
        setBoard(payload)
        setError(null)
      })
      .catch((loadError: unknown) => {
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

  const rows = useMemo(() => {
    const list = board?.stores ?? []
    const term = query.trim().toLowerCase()
    return list.filter((store) => {
      if (filter === 'flagged' && !store.flagged) return false
      if (filter === 'gap' && !store.missingLeadership) return false
      if (!term) return true
      const haystack = [
        store.name,
        store.internalCode ?? '',
        store.generalManager?.name ?? '',
        store.supervisor?.name ?? '',
        ...store.managers.map((item) => item.name)
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [board, query, filter])

  function openCreate(): void {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(store: StoreBoardItem): void {
    setEditing(store)
    setDialogOpen(true)
  }

  function onSaved(store: StoreBoardItem): void {
    setBoard((current) => {
      if (!current) return current
      const exists = current.stores.some((item) => item.id === store.id)
      const stores = exists
        ? current.stores.map((item) => (item.id === store.id ? store : item))
        : [...current.stores, store].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
      return {
        ...current,
        stores,
        storeCount: stores.length,
        flaggedCount: stores.filter((item) => item.flagged).length,
        missingLeadershipCount: stores.filter((item) => item.missingLeadership).length,
        employeeCount: stores.reduce((total, item) => total + item.employeeCount, 0),
        cardsThisMonth: stores.reduce((total, item) => total + item.cardsThisMonth, 0)
      }
    })
    onDeskChanged?.()
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-6 h-8 w-40 animate-pulse rounded-full bg-white/5" />
        <div className="mb-3 grid grid-cols-4 gap-3">
          <div className="h-20 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-20 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-20 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-20 animate-pulse rounded-[16px] bg-white/4" />
        </div>
        <div className="min-h-0 flex-1 animate-pulse rounded-[16px] bg-white/4" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] text-[#F0EFEC]/88">Unidades</h1>
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
            {storeId
              ? 'Mesa da unidade selecionada: equipe, metas do Card+ e liderança FLOW.'
              : 'Todas as lojas do Card+, com gerentes, supervisor e acompanhamento da operação.'}
          </p>
        </div>
        {board?.canCreate ? (
          <button
            type="button"
            onClick={openCreate}
            className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
          >
            Cadastrar unidade
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      {board ? (
        <div className="mb-3 grid grid-cols-4 gap-3">
          <SummaryCard label="Unidades" value={formatCount(board.storeCount)} />
          <SummaryCard label="Equipe ativa" value={formatCount(board.employeeCount)} />
          <SummaryCard label="Cartões no mês" value={formatCount(board.cardsThisMonth)} />
          <SummaryCard
            label="Sem liderança completa"
            value={formatCount(board.missingLeadershipCount)}
            warn={board.missingLeadershipCount > 0}
          />
        </div>
      ) : null}

      {!board || board.stores.length === 0 ? (
        <EmptyStores canCreate={Boolean(board?.canCreate)} onCreate={openCreate} />
      ) : (
        <section className="mb-8 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar unidade, gerente ou supervisor"
                className="h-8 w-[260px] rounded-[8px] border-white/[0.06] bg-transparent text-[13px]"
              />
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                Todas
              </FilterChip>
              <FilterChip active={filter === 'gap'} onClick={() => setFilter('gap')}>
                Sem liderança
              </FilterChip>
              <FilterChip active={filter === 'flagged'} onClick={() => setFilter('flagged')}>
                Atenção
              </FilterChip>
            </div>
            <span className="text-[12px] text-[#F0EFEC]/32">
              {formatCount(rows.length)} {rows.length === 1 ? 'unidade' : 'unidades'}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#1A1A1A] text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                <tr className="border-y border-white/[0.04]">
                  <th className="px-5 py-2.5 font-medium">Unidade</th>
                  <th className="px-3 py-2.5 font-medium">Equipe</th>
                  <th className="px-3 py-2.5 font-medium">Cartões</th>
                  <th className="px-3 py-2.5 font-medium">Venda</th>
                  <th className="px-3 py-2.5 font-medium">Gerente geral</th>
                  <th className="px-3 py-2.5 font-medium">Supervisor</th>
                  <th className="px-3 py-2.5 font-medium">Gerentes</th>
                  <th className="w-[120px] px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((store) => (
                  <tr
                    key={store.id}
                    className="border-t border-white/[0.03] text-[13px] transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[#F0EFEC]/82">{store.name}</span>
                        {store.flagged ? <Flag className="size-3 text-amber-300/80" strokeWidth={1.8} /> : null}
                      </div>
                      <span className="mt-0.5 block text-[11px] text-[#F0EFEC]/32">
                        {store.internalCode ? `Código ${store.internalCode}` : 'Sem código interno'}
                        {store.operationLead ? ` · Líder ${store.operationLead.name}` : ''}
                        {store.hasOperationalAccess ? '' : ' · Sem login operacional'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#F0EFEC]/70">{formatCount(store.employeeCount)}</td>
                    <td className="px-3 py-3 text-[#F0EFEC]/70">
                      <span>{formatCount(store.cardsThisMonth)}</span>
                      <span className="ml-1 text-[11px] text-[#F0EFEC]/32">
                        {store.monthGoal === null ? '' : `/ ${formatCount(store.monthGoal)}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#F0EFEC]/70">
                      {store.salesThisMonthCents === 0 && store.monthSalesGoalCents === null ? (
                        <ValuePending size="sm" />
                      ) : (
                        formatBRLFromCents(store.salesThisMonthCents)
                      )}
                    </td>
                    <td className="px-3 py-3 text-[#F0EFEC]/62">
                      {store.generalManager?.name ?? <span className="text-[#F0EFEC]/28">—</span>}
                    </td>
                    <td className="px-3 py-3 text-[#F0EFEC]/62">
                      {store.supervisor?.name ?? <span className="text-[#F0EFEC]/28">—</span>}
                    </td>
                    <td className="px-3 py-3 text-[#F0EFEC]/62">
                      {store.managers.length === 0 ? (
                        <span className="text-[#F0EFEC]/28">—</span>
                      ) : (
                        store.managers.map((item) => item.name).join(', ')
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {onOpenOperation ? (
                          <IconButton label="Ver operação" onClick={() => onOpenOperation(store.id)}>
                            <LayoutDashboard className="size-3.5" strokeWidth={1.7} />
                          </IconButton>
                        ) : null}
                        {onOpenTeam ? (
                          <IconButton label="Ver equipe" onClick={() => onOpenTeam(store.id)}>
                            <Users className="size-3.5" strokeWidth={1.7} />
                          </IconButton>
                        ) : null}
                        {board?.canEdit ? (
                          <IconButton label="Editar mesa" onClick={() => openEdit(store)}>
                            <Settings className="size-3.5" strokeWidth={1.7} />
                          </IconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <StoreDialog
        open={dialogOpen}
        mode={editing ? 'edit' : 'create'}
        store={editing}
        people={board?.people ?? []}
        supervisorPeople={board?.supervisorPeople ?? []}
        onClose={() => setDialogOpen(false)}
        onSaved={onSaved}
      />
    </div>
  )
}

function SummaryCard({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <article className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-4 py-3">
      <p className="text-[12px] text-[#F0EFEC]/38">{label}</p>
      <p className={cn('mt-1 text-[22px] tracking-tight', warn ? 'text-amber-200/85' : 'text-[#F0EFEC]/88')}>
        {value}
      </p>
    </article>
  )
}

function FilterChip({
  active,
  children,
  onClick
}: {
  active: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 rounded-[8px] px-2.5 text-[12px] transition-colors',
        active ? 'bg-white/[0.08] text-[#F0EFEC]/80' : 'text-[#F0EFEC]/40 hover:bg-white/[0.04] hover:text-[#F0EFEC]/60'
      )}
    >
      {children}
    </button>
  )
}

function IconButton({
  label,
  children,
  onClick
}: {
  label: string
  children: React.ReactNode
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

function EmptyStores({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
      <p className="text-[16px] text-[#F0EFEC]/78">Nenhuma unidade neste recorte</p>
      <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-[#F0EFEC]/38">
        As unidades vêm do Card+. Depois de cadastrar, defina gerente geral, supervisor e gerentes aqui.
      </p>
      {canCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
        >
          Cadastrar unidade
        </button>
      ) : null}
    </div>
  )
}
