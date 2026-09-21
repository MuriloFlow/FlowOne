import log from 'electron-log'
import { listStores } from './cardplus'
import { getFlowAdminClient } from './supabase-clients'
import {
  isSorteioValeType,
  isValidPhone,
  onlyCpfDigits,
  onlyPhoneDigits,
  presentSorteioClient,
  sorteioValeLabel,
  type SorteioAddValeInput,
  type SorteioBoard,
  type SorteioClient,
  type SorteioConfirmResult,
  type SorteioLookup,
  type SorteioRegisterInput,
  type SorteioVale,
  type SorteioValeTypeId
} from '../shared/sorteio'
import { isValidCpf } from '../shared/cpf'

type ClientRow = {
  id: string
  cpf_digits: string
  name: string
  phone_digits: string
  created_at: string
  updated_at: string
  created_store_id: string | null
}

type ValeRow = {
  id: string
  client_id: string
  cardplus_store_id: string
  vale_type: string
  vale_label: string
  created_at: string
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_sorteio_/i.test(error.message ?? '')
  )
}

function requireStoreId(storeId: string | null | undefined): string {
  const id = (storeId ?? '').trim()
  if (!id) throw new Error('Selecione uma unidade para o sorteio.')
  return id
}

function parseValeType(value: string, customLabel?: string | null): { type: SorteioValeTypeId; label: string } {
  if (!isSorteioValeType(value)) throw new Error('Tipo de vale inválido.')
  if (value === 'OUTRO' && !customLabel?.trim()) {
    throw new Error('Descreva o tipo de vale.')
  }
  return { type: value, label: sorteioValeLabel(value, customLabel) }
}

async function storeNameMap(): Promise<Map<string, string>> {
  const stores = await listStores()
  return new Map(stores.map((store) => [store.id, store.name]))
}

async function countChances(clientId: string, storeId?: string | null): Promise<number> {
  let query = getFlowAdminClient()
    .from('flow_sorteio_vales')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
  if (storeId) query = query.eq('cardplus_store_id', storeId)
  const { count, error } = await query
  if (error && !isMissingTable(error)) throw new Error(`Erro ao contar vales: ${error.message}`)
  return count ?? 0
}

async function loadClientByCpf(cpfDigits: string): Promise<ClientRow | null> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_sorteio_clients')
    .select('id, cpf_digits, name, phone_digits, created_at, updated_at, created_store_id')
    .eq('cpf_digits', cpfDigits)
    .maybeSingle()
  if (error && !isMissingTable(error)) throw new Error(`Erro ao buscar cliente: ${error.message}`)
  if (error && isMissingTable(error)) {
    throw new Error('Tabelas do sorteio ausentes. Rode o SQL 0017_flow_sorteio.sql no Supabase FLOW.')
  }
  return (data as ClientRow | null) ?? null
}

function presentVale(row: ValeRow, storeNames: Map<string, string>): SorteioVale {
  return {
    id: row.id,
    clientId: row.client_id,
    storeId: row.cardplus_store_id,
    storeName: storeNames.get(row.cardplus_store_id) ?? 'Unidade',
    valeType: isSorteioValeType(row.vale_type) ? row.vale_type : 'OUTRO',
    valeLabel: row.vale_label,
    createdAt: row.created_at
  }
}

export async function lookupSorteioClient(
  cpf: string,
  storeId?: string | null
): Promise<SorteioLookup> {
  const digits = onlyCpfDigits(cpf)
  if (!isValidCpf(digits)) throw new Error('CPF inválido.')
  const row = await loadClientByCpf(digits)
  if (!row) return { found: false, client: null }
  const chances = await countChances(row.id, storeId)
  return { found: true, client: presentSorteioClient({ ...row, chances }) }
}

export async function listSorteioBoard(storeId?: string | null): Promise<SorteioBoard> {
  const storeNames = await storeNameMap()
  const clientsQuery = getFlowAdminClient()
    .from('flow_sorteio_clients')
    .select('id, cpf_digits, name, phone_digits, created_at, updated_at, created_store_id')
    .order('updated_at', { ascending: false })

  const { data: clientsData, error: clientsError } = await clientsQuery
  if (clientsError) {
    if (isMissingTable(clientsError)) {
      throw new Error('Tabelas do sorteio ausentes. Rode o SQL 0017_flow_sorteio.sql no Supabase FLOW.')
    }
    throw new Error(`Erro ao carregar clientes do sorteio: ${clientsError.message}`)
  }

  let valesQuery = getFlowAdminClient()
    .from('flow_sorteio_vales')
    .select('id, client_id, cardplus_store_id, vale_type, vale_label, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (storeId) valesQuery = valesQuery.eq('cardplus_store_id', storeId)

  const { data: valesData, error: valesError } = await valesQuery
  if (valesError && !isMissingTable(valesError)) {
    throw new Error(`Erro ao carregar vales: ${valesError.message}`)
  }

  const vales = ((valesData ?? []) as ValeRow[])
  const chanceByClient = new Map<string, number>()
  for (const vale of vales) {
    chanceByClient.set(vale.client_id, (chanceByClient.get(vale.client_id) ?? 0) + 1)
  }

  // Se filtrou por loja, ainda precisamos das chances só dessa loja; se não, contar todos.
  if (!storeId) {
    chanceByClient.clear()
    const { data: allVales, error } = await getFlowAdminClient()
      .from('flow_sorteio_vales')
      .select('client_id')
    if (error && !isMissingTable(error)) throw new Error(`Erro ao contar vales: ${error.message}`)
    for (const row of (allVales ?? []) as Array<{ client_id: string }>) {
      chanceByClient.set(row.client_id, (chanceByClient.get(row.client_id) ?? 0) + 1)
    }
  }

  const clients: SorteioClient[] = ((clientsData ?? []) as ClientRow[])
    .map((row) => presentSorteioClient({ ...row, chances: chanceByClient.get(row.id) ?? 0 }))
    .filter((client) => !storeId || client.chances > 0 || client.createdStoreId === storeId)
    .sort((a, b) => b.chances - a.chances || a.name.localeCompare(b.name, 'pt-BR'))

  const clientById = new Map(clients.map((client) => [client.id, client]))
  // Inclui nomes mesmo se o filtro escondeu alguém sem chance nesta loja
  for (const row of (clientsData ?? []) as ClientRow[]) {
    if (!clientById.has(row.id)) {
      clientById.set(row.id, presentSorteioClient({ ...row, chances: chanceByClient.get(row.id) ?? 0 }))
    }
  }

  const recentVales = vales.slice(0, 80).map((row) => {
    const client = clientById.get(row.client_id)
    return {
      ...presentVale(row, storeNames),
      clientName: client?.name ?? 'Cliente',
      cpfMasked: client?.cpfMasked ?? '***.***.***-**'
    }
  })

  return {
    clients,
    recentVales,
    totalClients: clients.length,
    totalVales: storeId ? vales.length : [...chanceByClient.values()].reduce((sum, n) => sum + n, 0)
  }
}

async function insertVale(
  clientId: string,
  storeId: string,
  type: SorteioValeTypeId,
  label: string,
  createdBy?: string | null
): Promise<ValeRow> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_sorteio_vales')
    .insert({
      client_id: clientId,
      cardplus_store_id: storeId,
      vale_type: type,
      vale_label: label,
      created_by: createdBy ?? null
    })
    .select('id, client_id, cardplus_store_id, vale_type, vale_label, created_at')
    .single()

  if (error) throw new Error(`Erro ao registrar vale: ${error.message}`)
  return data as ValeRow
}

export async function registerSorteioClient(
  input: SorteioRegisterInput,
  createdBy?: string | null
): Promise<SorteioConfirmResult> {
  const storeId = requireStoreId(input.storeId)
  const cpfDigits = onlyCpfDigits(input.cpf)
  if (!isValidCpf(cpfDigits)) throw new Error('CPF inválido.')
  const name = input.name.trim()
  if (name.length < 2) throw new Error('Informe o nome do cliente.')
  const phoneDigits = onlyPhoneDigits(input.phone)
  if (!isValidPhone(phoneDigits)) throw new Error('Telefone inválido.')
  const { type, label } = parseValeType(input.valeType, input.valeLabel)

  const existing = await loadClientByCpf(cpfDigits)
  if (existing) {
    throw new Error('Este CPF já está cadastrado. Use a etapa de vale para somar +1 chance.')
  }

  const now = new Date().toISOString()
  const { data, error } = await getFlowAdminClient()
    .from('flow_sorteio_clients')
    .insert({
      cpf_digits: cpfDigits,
      name,
      phone_digits: phoneDigits,
      created_store_id: storeId,
      created_at: now,
      updated_at: now
    })
    .select('id, cpf_digits, name, phone_digits, created_at, updated_at, created_store_id')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('Este CPF já está cadastrado.')
    throw new Error(`Erro ao cadastrar cliente: ${error.message}`)
  }

  const clientRow = data as ClientRow
  const valeRow = await insertVale(clientRow.id, storeId, type, label, createdBy)
  await getFlowAdminClient()
    .from('flow_sorteio_clients')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', clientRow.id)

  const storeNames = await storeNameMap()
  const chances = await countChances(clientRow.id, storeId)
  return {
    client: presentSorteioClient({ ...clientRow, chances }),
    vale: presentVale(valeRow, storeNames),
    isNewClient: true
  }
}

export async function addSorteioVale(
  input: SorteioAddValeInput,
  createdBy?: string | null
): Promise<SorteioConfirmResult> {
  const storeId = requireStoreId(input.storeId)
  const cpfDigits = onlyCpfDigits(input.cpf)
  if (!isValidCpf(cpfDigits)) throw new Error('CPF inválido.')
  const { type, label } = parseValeType(input.valeType, input.valeLabel)

  const existing = await loadClientByCpf(cpfDigits)
  if (!existing) throw new Error('Cliente não encontrado. Faça o cadastro primeiro.')

  const valeRow = await insertVale(existing.id, storeId, type, label, createdBy)
  await getFlowAdminClient()
    .from('flow_sorteio_clients')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', existing.id)

  const storeNames = await storeNameMap()
  const chances = await countChances(existing.id, storeId)
  log.info('[sorteio] vale', existing.cpf_digits, type, chances)
  return {
    client: presentSorteioClient({ ...existing, chances }),
    vale: presentVale(valeRow, storeNames),
    isNewClient: false
  }
}
