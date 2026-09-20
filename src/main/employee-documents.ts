import log from 'electron-log'
import type { EmployeeDocument } from '../shared/operations'
import { isAttendancePhotoDataUrl } from '../shared/attendance'
import { getFlowAdminClient } from './supabase-clients'

const MAX_DOCUMENT_LENGTH = 1_500_000

type DocumentRow = {
  cardplus_collaborator_id: string
  rg_image: string | null
  updated_at: string
}

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || /flow_employee_documents/i.test(error.message ?? '')))
}

function toDocument(row: DocumentRow | null, collaboratorId: string): EmployeeDocument {
  return {
    collaboratorId,
    rgImage: row?.rg_image ?? null,
    updatedAt: row?.updated_at ?? null
  }
}

export async function getEmployeeDocument(collaboratorId: string): Promise<EmployeeDocument> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_employee_documents')
    .select('cardplus_collaborator_id, rg_image, updated_at')
    .eq('cardplus_collaborator_id', collaboratorId)
    .maybeSingle()
  if (error) {
    if (missingTable(error)) return toDocument(null, collaboratorId)
    throw new Error(`Erro ao carregar documento: ${error.message}`)
  }
  return toDocument(data as DocumentRow | null, collaboratorId)
}

export async function listEmployeeDocuments(): Promise<Map<string, EmployeeDocument>> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_employee_documents')
    .select('cardplus_collaborator_id, rg_image, updated_at')
  if (error) {
    if (missingTable(error)) return new Map()
    throw new Error(`Erro ao carregar documentos: ${error.message}`)
  }
  return new Map(
    ((data ?? []) as DocumentRow[]).map((row) => [
      row.cardplus_collaborator_id,
      toDocument(row, row.cardplus_collaborator_id)
    ])
  )
}

export async function saveEmployeeDocument(collaboratorId: string, rgImage: string | null): Promise<EmployeeDocument> {
  const image = rgImage?.trim() || null
  if (image && (!isAttendancePhotoDataUrl(image) || image.length > MAX_DOCUMENT_LENGTH)) {
    throw new Error('A imagem do RG é inválida ou grande demais. Envie uma foto de até 1,5 MB.')
  }
  if (!image) {
    const { error } = await getFlowAdminClient()
      .from('flow_employee_documents')
      .delete()
      .eq('cardplus_collaborator_id', collaboratorId)
    if (error && !missingTable(error)) throw new Error(`Erro ao remover documento: ${error.message}`)
    return toDocument(null, collaboratorId)
  }
  const updatedAt = new Date().toISOString()
  const { data, error } = await getFlowAdminClient()
    .from('flow_employee_documents')
    .upsert({ cardplus_collaborator_id: collaboratorId, rg_image: image, updated_at: updatedAt }, { onConflict: 'cardplus_collaborator_id' })
    .select('cardplus_collaborator_id, rg_image, updated_at')
    .single()
  if (error) throw new Error(`Erro ao salvar documento: ${error.message}`)
  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action: 'employee.document.upsert',
      entity_type: 'flow_employee_documents',
      entity_id: collaboratorId,
      metadata: { has_rg_image: true }
    })
  } catch (auditError) {
    log.warn('[employee-documents] auditoria não registrada', auditError)
  }
  return toDocument(data as DocumentRow, collaboratorId)
}

export async function deleteEmployeeDocument(collaboratorId: string): Promise<void> {
  await saveEmployeeDocument(collaboratorId, null)
}
