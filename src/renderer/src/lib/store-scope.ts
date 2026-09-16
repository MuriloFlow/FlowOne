import { normalizeStoreId } from '../../../shared/store-scope'

let currentStoreId: string | null = null

export function setCurrentStoreId(storeId: string | null): void {
  currentStoreId = normalizeStoreId(storeId)
}

export function getCurrentStoreId(): string | null {
  return currentStoreId
}
