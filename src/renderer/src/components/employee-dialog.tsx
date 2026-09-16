import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formatCpf, onlyCpfDigits } from '../../../shared/cpf'
import {
  CARDPLUS_SUB_ROLES,
  type CardPlusSubRole,
  type EmployeeIdentity,
  type EmployeeListItem,
  type StoreOption
} from '../../../shared/operations'
import { DEFAULT_EMPLOYEE_ROLE, FLOW_ROLES, isFlowRole, type FlowRoleId } from '@/lib/roles'
import { operationError, operations } from '@/lib/operations'

type EmployeeDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  employee?: EmployeeListItem | null
  stores: StoreOption[]
  defaultStoreId?: string | null
  onClose: () => void
  onSaved: (employee: EmployeeListItem) => void
}

const ROLE_OPTIONS = FLOW_ROLES.map((role) => ({ value: role.id, label: role.label }))
const CARDPLUS_OPTIONS = CARDPLUS_SUB_ROLES.map((role) => ({ value: role, label: role }))

export function EmployeeDialog({
  open,
  mode,
  employee,
  stores,
  defaultStoreId = null,
  onClose,
  onSaved
}: EmployeeDialogProps) {
  const [name, setName] = useState('')
  const [storeId, setStoreId] = useState('')
  const [flowRole, setFlowRole] = useState<FlowRoleId>(DEFAULT_EMPLOYEE_ROLE)
  const [cardplusRole, setCardplusRole] = useState<CardPlusSubRole>(CARDPLUS_SUB_ROLES[0])
  const [cpf, setCpf] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingIdentity, setLoadingIdentity] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setName(employee?.name ?? '')
    setStoreId(employee?.storeId ?? defaultStoreId ?? stores[0]?.id ?? '')
    const nextRole = employee?.flowRole
    setFlowRole(nextRole && isFlowRole(nextRole) ? nextRole : DEFAULT_EMPLOYEE_ROLE)
    setCardplusRole(
      CARDPLUS_SUB_ROLES.includes(employee?.cardplusRole as (typeof CARDPLUS_SUB_ROLES)[number])
        ? (employee?.cardplusRole as (typeof CARDPLUS_SUB_ROLES)[number])
        : CARDPLUS_SUB_ROLES[0]
    )
    setIsActive(employee?.isActive ?? true)
    setCpf('')

    if (mode === 'edit' && employee) {
      setLoadingIdentity(true)
      void operations()
        .getEmployeeIdentity(employee.id)
        .then((identity: EmployeeIdentity) => {
          setCpf(identity.cpf ? formatCpf(identity.cpf) : '')
          if (identity.flowRole && isFlowRole(identity.flowRole)) setFlowRole(identity.flowRole)
        })
        .catch((identityError: unknown) => setError(operationError(identityError)))
        .finally(() => setLoadingIdentity(false))
    }
  }, [open, mode, employee, stores, defaultStoreId])

  async function submit(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        storeId,
        cardplusRole,
        flowRole,
        cpf: onlyCpfDigits(cpf),
        isActive
      }
      const saved =
        mode === 'create'
          ? await operations().createEmployee(payload)
          : await operations().updateEmployee({ ...payload, id: employee!.id })
      onSaved(saved)
      onClose()
    } catch (submitError) {
      setError(operationError(submitError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={mode === 'create' ? 'Cadastrar funcionário' : 'Editar funcionário'}
      description="Nome, unidade e função operacional ficam no Card+. CPF e cargo FLOW ficam só neste launcher."
      onClose={onClose}
    >
      <div className="space-y-3.5 px-5 pb-5">
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">Nome</Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome completo"
            className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Unidade</Label>
            <Select
              value={storeId}
              options={stores.map((store) => ({ value: store.id, label: store.name }))}
              placeholder="Selecionar unidade"
              onChange={setStoreId}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Cargo FLOW</Label>
            <Select
              value={flowRole}
              options={ROLE_OPTIONS}
              onChange={(value) => {
                if (isFlowRole(value)) setFlowRole(value)
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Função operacional</Label>
            <Select
              value={cardplusRole}
              options={CARDPLUS_OPTIONS}
              onChange={(value) => {
                if ((CARDPLUS_SUB_ROLES as readonly string[]).includes(value)) {
                  setCardplusRole(value as CardPlusSubRole)
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">CPF</Label>
            <Input
              value={cpf}
              disabled={loadingIdentity}
              onChange={(event) => setCpf(formatCpf(event.target.value))}
              placeholder="000.000.000-00"
              className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
            />
          </div>
        </div>

        {mode === 'edit' ? (
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Status</Label>
            <Select
              value={isActive ? 'active' : 'inactive'}
              options={[
                { value: 'active', label: 'Ativo' },
                { value: 'inactive', label: 'Inativo' }
              ]}
              onChange={(value) => setIsActive(value === 'active')}
            />
          </div>
        ) : null}

        {error ? <p className="text-[12px] text-red-400/80">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 transition-colors hover:bg-white/[0.04] hover:text-[#F0EFEC]/70"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || loadingIdentity || !name.trim() || !storeId}
            onClick={() => void submit()}
            className="inline-flex h-8 items-center justify-center rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] font-medium text-[#111111] transition-opacity disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : mode === 'create' ? 'Cadastrar' : 'Salvar'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
