type Entry<T> = {
  expiresAt: number
  value: T
}

const cache = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export function memo<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) {
    return Promise.resolve(hit.value as T)
  }

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const promise = loader()
    .then((value) => {
      cache.set(key, { expiresAt: Date.now() + ttlMs, value })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

export function invalidateMemo(prefix?: string): void {
  if (!prefix) {
    cache.clear()
    return
  }
  for (const key of [...cache.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}:`) || key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}
