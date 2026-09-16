export const ALL_STORES = 'all' as const

export function normalizeStoreId(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === ALL_STORES) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === ALL_STORES || trimmed === 'null' || trimmed === 'undefined') return null
    return trimmed
  }
  if (typeof value === 'object') {
    const record = value as { storeId?: unknown; store_id?: unknown }
    if ('storeId' in record) return normalizeStoreId(record.storeId)
    if ('store_id' in record) return normalizeStoreId(record.store_id)
  }
  return null
}
