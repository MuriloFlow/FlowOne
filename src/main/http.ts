const TIMEOUT_MS = 18_000
const MAX_ATTEMPTS = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function methodOf(init?: RequestInit): string {
  return (init?.method ?? 'GET').toUpperCase()
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String(error.name) : ''
  const message = 'message' in error ? String(error.message) : ''
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    name === 'TypeError' ||
    /fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket/i.test(message)
  )
}

export async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const retrySafe = methodOf(init) === 'GET' || methodOf(init) === 'HEAD'
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const parent = init?.signal
    const onAbort = () => controller.abort()
    if (parent) {
      if (parent.aborted) controller.abort()
      else parent.addEventListener('abort', onAbort, { once: true })
    }

    try {
      const response = await fetch(input, { ...init, signal: controller.signal })
      if (retrySafe && isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
        await sleep(350 * attempt)
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (parent?.aborted) throw error
      if (retrySafe && attempt < MAX_ATTEMPTS && isRetryableError(error)) {
        await sleep(350 * attempt)
        continue
      }
      throw error
    } finally {
      clearTimeout(timeout)
      parent?.removeEventListener('abort', onAbort)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha de rede ao falar com o banco.')
}
