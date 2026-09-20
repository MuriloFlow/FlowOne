import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Loader2, ScanLine, Trash2, Upload } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formatCpf, onlyCpfDigits } from '../../../shared/cpf'
import {
  CARDPLUS_STORE_ROLES,
  isManagerLoginSubRole,
  type CardPlusSubRole,
  type EmployeeIdentity,
  type EmployeeDocument,
  type EmployeeListItem,
  type StoreOption
} from '../../../shared/operations'
import { DEFAULT_EMPLOYEE_ROLE, FLOW_ROLES, isFlowRole, suggestedFlowRole, type FlowRoleId } from '@/lib/roles'
import { operationError, operations } from '@/lib/operations'
import { compressAttendancePhoto } from '@/lib/attendance-photo'

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
const CARDPLUS_OPTIONS = CARDPLUS_STORE_ROLES.map((role) => ({ value: role, label: role }))

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
  const [cardplusRole, setCardplusRole] = useState<CardPlusSubRole>(CARDPLUS_STORE_ROLES[0])
  const [cpf, setCpf] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingIdentity, setLoadingIdentity] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rgImage, setRgImage] = useState<string | null>(null)
  const [loadingDocument, setLoadingDocument] = useState(false)
  const [compressingDocument, setCompressingDocument] = useState(false)
  const documentInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setName(employee?.name ?? '')
    setStoreId(employee?.storeId?.trim() || defaultStoreId || stores[0]?.id || '')
    setFlowRole(suggestedFlowRole(employee?.flowRole, employee?.cardplusRole, employee?.globalDeskLabel))
    const matchedCard =
      CARDPLUS_STORE_ROLES.find((role) => role.toLowerCase() === (employee?.cardplusRole ?? '').toLowerCase()) ??
      CARDPLUS_STORE_ROLES[0]
    setCardplusRole(matchedCard)
    setIsActive(employee?.isActive ?? true)
    setCpf('')
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    setDisplayName(employee?.name ?? '')
    setShowPassword(false)
    setRgImage(null)

    if (mode === 'edit' && employee) {
      setLoadingIdentity(true)
      void operations()
        .getEmployeeIdentity(employee.id)
        .then((identity: EmployeeIdentity) => {
          setCpf(identity.cpf ? formatCpf(identity.cpf) : '')
          if (identity.flowRole && isFlowRole(identity.flowRole)) {
            setFlowRole(suggestedFlowRole(identity.flowRole, employee.cardplusRole, employee.globalDeskLabel))
          }
        })
        .catch((identityError: unknown) => setError(operationError(identityError)))
        .finally(() => setLoadingIdentity(false))
      setLoadingDocument(true)
      void operations()
        .getEmployeeDocument(employee.id)
        .then((document: EmployeeDocument) => setRgImage(document.rgImage))
        .catch((documentError: unknown) => setError(operationError(documentError)))
        .finally(() => setLoadingDocument(false))
    }
  }, [open, mode, employee, stores, defaultStoreId])

  const needsLogin = isManagerLoginSubRole(cardplusRole)

  async function chooseDocument(file: File | null): Promise<void> {
    if (!file) return
    setCompressingDocument(true)
    setError(null)
    try {
      setRgImage(await compressAttendancePhoto(file))
    } catch (documentError) {
      setError(operationError(documentError))
    } finally {
      setCompressingDocument(false)
    }
  }

  async function submit(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      if (needsLogin && mode === 'create') {
        if (!username.trim() || password.length < 6) {
          throw new Error('Informe login e senha com pelo menos 6 caracteres.')
        }
        if (password !== confirmPassword) {
          throw new Error('As senhas não coincidem.')
        }
      }
      const payload = {
        name,
        storeId,
        cardplusRole,
        flowRole,
        cpf: onlyCpfDigits(cpf),
        isActive,
        accessUsername: needsLogin ? username : undefined,
        accessPassword: needsLogin ? password : undefined,
        accessDisplayName: needsLogin ? displayName || name : undefined
      }
      const saved =
        mode === 'create'
          ? await operations().createEmployee(payload)
          : await operations().updateEmployee({ ...payload, id: employee!.id })
      if (rgImage !== null || mode === 'edit') {
        await operations().saveEmployeeDocument({ collaboratorId: saved.id, rgImage })
      }
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
      description={
        employee?.isGlobalDesk
          ? 'Cargo FLOW é o que vale no launcher e no menu. Função operacional grava no colaborador da loja no Card+. A conta TI/Regional da rede continua lá, mas não aparece como cargo.'
          : needsLogin && mode === 'create'
            ? 'Nome e função vão para o Card+. Login e senha deste gerente também entram no mesmo cadastro.'
            : 'Nome, unidade e função operacional gravam no Card+. CPF e cargo FLOW ficam neste launcher e acompanham o login se for a mesma pessoa.'
      }
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
                if ((CARDPLUS_STORE_ROLES as readonly string[]).includes(value)) {
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

        <div className="space-y-2 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-[12px] text-[#F0EFEC]/65">Documento de identidade (RG)</Label>
              <p className="mt-1 text-[11px] leading-relaxed text-[#F0EFEC]/35">
                Foto centralizada e protegida no FLOW. Ela entra no recibo de pagamento assinado.
              </p>
            </div>
            <ScanLine className="mt-0.5 size-4 shrink-0 text-[#F0EFEC]/32" strokeWidth={1.6} />
          </div>
          <input
            ref={documentInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void chooseDocument(event.target.files?.[0] ?? null)}
          />
          {rgImage ? (
            <div className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-black/20">
              <img src={rgImage} alt="Documento RG" className="max-h-44 w-full object-contain" />
              <div className="flex items-center justify-between border-t border-white/[0.06] px-2 py-1.5">
                <span className="text-[11px] text-[#F0EFEC]/42">RG anexado</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => documentInputRef.current?.click()} className="rounded-[6px] p-1.5 text-[#F0EFEC]/50 hover:bg-white/[0.06]">
                    <Upload className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => setRgImage(null)} className="rounded-[6px] p-1.5 text-red-300/70 hover:bg-red-400/10">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={loadingDocument || compressingDocument}
              onClick={() => documentInputRef.current?.click()}
              className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-white/[0.1] text-[#F0EFEC]/42 transition-colors hover:border-white/[0.2] hover:bg-white/[0.03] disabled:opacity-50"
            >
              {compressingDocument || loadingDocument ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              <span className="text-[12px]">{compressingDocument ? 'Preparando imagem...' : 'Anexar foto do RG'}</span>
            </button>
          )}
        </div>

        {needsLogin && mode === 'create' ? (
          <div className="space-y-3.5 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3.5">
            <div>
              <p className="text-[13px] text-[#F0EFEC]/78">Acesso operacional no Card+</p>
              <p className="mt-0.5 text-[12px] text-[#F0EFEC]/38">
                Login separado da unidade, para este Gerente ou Gerente Geral entrar no Card+.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-[#F0EFEC]/45">Login</Label>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="nome.sobrenome"
                  autoComplete="off"
                  className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-[#F0EFEC]/45">Nome no Card+</Label>
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={name.trim() || 'Nome de exibição'}
                  className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-[#F0EFEC]/45">Senha</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mínimo 6 caracteres"
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
            disabled={
              saving ||
              loadingIdentity ||
              loadingDocument ||
              compressingDocument ||
              !name.trim() ||
              !storeId ||
              (needsLogin && mode === 'create' && (!username.trim() || password.length < 6))
            }
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
