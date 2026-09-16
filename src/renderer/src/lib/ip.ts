const IP_TIMEOUT_MS = 2500

export async function getPublicIp(): Promise<string | null> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), IP_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { ip?: string }
    return typeof payload.ip === 'string' && payload.ip.length > 0 ? payload.ip : null
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}
