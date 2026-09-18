declare module '@capacitor/core' {
  export const Capacitor: {
    isNativePlatform: () => boolean
  }
}

declare module '@capacitor/preferences' {
  export const Preferences: {
    get: (options: { key: string }) => Promise<{ value: string | null }>
    set: (options: { key: string; value: string }) => Promise<void>
    remove: (options: { key: string }) => Promise<void>
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
