export const ALL_STORES = 'all' as const

export function normalizeStoreId(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === ALL_STORES) return null
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (typeof value === 'object' && value && 'storeId' in value) {
    return normalizeStoreId((value as { storeId: unknown }).storeId)
  }
  return null
}
