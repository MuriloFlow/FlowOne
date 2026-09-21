import { formatCpf, maskCpf } from './cpf'

export const SORTEIO_VALE_TYPES = [
  {
    id: 'LEVOU_2',
    label: 'Levou 2 Concorre',
    description: 'Levou 2 peças de liquidação na compra.'
  },
  {
    id: 'COMPRA_150',
    label: 'Compra de +R$ 150,00',
    description: 'Compra acima de R$ 150,00.'
  },
  {
    id: 'OUTRO',
    label: 'Outro',
    description: 'Outra promoção da loja.'
  }
] as const

export type SorteioValeTypeId = (typeof SORTEIO_VALE_TYPES)[number]['id']

export function isSorteioValeType(value: string): value is SorteioValeTypeId {
  return SORTEIO_VALE_TYPES.some((item) => item.id === value)
}

export function sorteioValeLabel(type: SorteioValeTypeId, customLabel?: string | null): string {
  if (type === 'OUTRO' && customLabel?.trim()) return customLabel.trim().slice(0, 80)
  return SORTEIO_VALE_TYPES.find((item) => item.id === type)?.label ?? type
}

export function onlyPhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function formatPhone(value: string): string {
  const digits = onlyPhoneDigits(value)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function isValidPhone(value: string): boolean {
  const digits = onlyPhoneDigits(value)
  return digits.length === 10 || digits.length === 11
}

export type SorteioClient = {
  id: string
  cpfDigits: string
  cpfMasked: string
  cpfFormatted: string
  name: string
  phoneDigits: string
  phoneFormatted: string
  chances: number
  createdAt: string
  updatedAt: string
  createdStoreId: string | null
}

export type SorteioVale = {
  id: string
  clientId: string
  storeId: string
  storeName: string
  valeType: SorteioValeTypeId
  valeLabel: string
  createdAt: string
}

export type SorteioLookup = {
  found: boolean
  client: SorteioClient | null
}

export type SorteioBoard = {
  clients: SorteioClient[]
  recentVales: Array<SorteioVale & { clientName: string; cpfMasked: string }>
  totalClients: number
  totalVales: number
}

export type SorteioRegisterInput = {
  storeId: string
  cpf: string
  name: string
  phone: string
  valeType: SorteioValeTypeId
  valeLabel?: string | null
}

export type SorteioAddValeInput = {
  storeId: string
  cpf: string
  valeType: SorteioValeTypeId
  valeLabel?: string | null
}

export type SorteioConfirmResult = {
  client: SorteioClient
  vale: SorteioVale
  isNewClient: boolean
}

export function presentSorteioClient(row: {
  id: string
  cpf_digits: string
  name: string
  phone_digits: string
  created_at: string
  updated_at: string
  created_store_id: string | null
  chances?: number
}): SorteioClient {
  return {
    id: row.id,
    cpfDigits: row.cpf_digits,
    cpfMasked: maskCpf(row.cpf_digits) ?? formatCpf(row.cpf_digits),
    cpfFormatted: formatCpf(row.cpf_digits),
    name: row.name,
    phoneDigits: row.phone_digits,
    phoneFormatted: formatPhone(row.phone_digits),
    chances: row.chances ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdStoreId: row.created_store_id
  }
}

export { onlyCpfDigits, formatCpf, isValidCpf, maskCpf } from './cpf'
