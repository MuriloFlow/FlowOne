type BiometryType = {
  isAvailable: (options?: { useFallback?: boolean }) => Promise<{
    isAvailable: boolean
    biometryType?: number
    errorCode?: string
  }>
  verifyIdentity: (options?: {
    title?: string
    subtitle?: string
    description?: string
    maxAttempts?: number
    useFallback?: boolean
    allowDeviceCredential?: boolean
  }) => Promise<void>
}

export type DeviceUnlockResult =
  | { outcome: 'ok' }
  | { outcome: 'not-enrolled' }
  | { outcome: 'unavailable' }
  | { outcome: 'denied' }

const DEFAULT_TITLE = 'Confirme que é você'

async function nativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Desbloqueio local do aparelho: biometria (digital/face) cadastrada no
 * celular; sem biometria, cai para o PIN/padrão/senha do próprio aparelho
 * (allowDeviceCredential). Nada sai do dispositivo — apenas confirma que a
 * dona do celular está presente.
 */
export async function deviceUnlock(options?: { title?: string; description?: string }): Promise<DeviceUnlockResult> {
  if (!(await nativePlatform())) return { outcome: 'unavailable' }

  let biometric: BiometryType | null = null
  try {
    const mod = await import('@capgo/capacitor-native-biometric')
    biometric = mod.NativeBiometric as BiometryType
  } catch {
    return { outcome: 'unavailable' }
  }
  if (!biometric) return { outcome: 'unavailable' }

  let available = false
  try {
    const status = await biometric.isAvailable({ useFallback: true })
    available = Boolean(status?.isAvailable)
  } catch {
    available = false
  }
  if (!available) return { outcome: 'not-enrolled' }

  try {
    await biometric.verifyIdentity({
      title: options?.title?.trim() || DEFAULT_TITLE,
      subtitle: 'FLOW',
      description: options?.description?.trim() || 'Use a digital do aparelho para continuar.',
      maxAttempts: 3,
      useFallback: true,
      allowDeviceCredential: true
    })
    return { outcome: 'ok' }
  } catch (error) {
    const code = String((error as { errorCode?: string; message?: string })?.errorCode ?? (error as Error)?.message ?? '')
    if (/notavailable|notenrolled|none|sensorerror|nobiometric/i.test(code)) return { outcome: 'not-enrolled' }
    if (/cancel|dismiss|lockout|userfallback|error/i.test(code)) return { outcome: 'denied' }
    return { outcome: 'denied' }
  }
}

export function deviceUnlockSupported(): Promise<boolean> {
  return nativePlatform()
}
