declare module '@capacitor/core' {
  export const Capacitor: {
    isNativePlatform: () => boolean
    isPluginAvailable: (name: string) => boolean
  }
  export const CapacitorHttp: {
    get: (options: {
      url: string
      headers?: Record<string, string>
      connectTimeout?: number
      readTimeout?: number
      responseType?: 'text' | 'json'
    }) => Promise<{ status: number; data: unknown }>
  }
}

declare module '@capacitor/preferences' {
  export const Preferences: {
    get: (options: { key: string }) => Promise<{ value: string | null }>
    set: (options: { key: string; value: string }) => Promise<void>
    remove: (options: { key: string }) => Promise<void>
  }
}

declare module '@capacitor/app' {
  export const App: {
    addListener: (event: 'resume', listener: () => void) => Promise<{ remove: () => Promise<void> }>
  }
}

declare module '@capgo/capacitor-native-biometric' {
  export const NativeBiometric: {
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
}

declare module '@capacitor/local-notifications' {
  export const LocalNotifications: {
    requestPermissions: () => Promise<{ display: 'granted' | 'denied' | 'prompt' }>
    areEnabled: () => Promise<{ value: boolean }>
    schedule: (options: {
      notifications: Array<{
        id: number
        title: string
        body: string
        schedule?: { at?: Date }
        smallIcon?: string
        largeIcon?: string
        iconColor?: string
        channelId?: string
      }>
    }) => Promise<void>
  }
}

declare module '@capgo/capacitor-updater' {
  export const CapacitorUpdater: {
    notifyAppReady: () => Promise<void>
    download: (options: { url: string; version: string }) => Promise<{ id: string }>
    next: (options: { id: string }) => Promise<void>
    set: (options: { id: string }) => Promise<void>
    reload: () => Promise<void>
    current: () => Promise<{ bundle?: { id?: string; version?: string }; native?: string }>
  }
}
