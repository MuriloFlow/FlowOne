export const Capacitor = {
  isNativePlatform: () => false,
  isPluginAvailable: () => false
}

export const CapacitorHttp = {
  get: async () => ({ status: 404, data: '' })
}

export const App = {
  addListener: async () => ({ remove: async () => undefined })
}

export const Preferences = {
  get: async () => ({ value: null as string | null }),
  set: async () => undefined,
  remove: async () => undefined
}

export const CapacitorUpdater = {
  notifyAppReady: async () => undefined,
  download: async () => ({ id: 'builtin' }),
  next: async () => undefined,
  set: async () => undefined,
  reload: async () => undefined,
  current: async () => ({ bundle: { id: 'builtin', version: '0.0.0' }, native: '0.0.0' })
}

export const NativeBiometric = {
  isAvailable: async () => ({ isAvailable: false }),
  verifyIdentity: async () => undefined
}

export const LocalNotifications = {
  requestPermissions: async () => ({ display: 'granted' as const }),
  areEnabled: async () => ({ value: false }),
  schedule: async () => undefined
}

export const Directory = { Cache: 'CACHE', Data: 'DATA', ExternalCache: 'EXTERNAL_CACHE' }
export const Filesystem = { writeFile: async () => ({ uri: 'file:///tmp/flow-stub' }) }
export const Share = { share: async () => undefined }
export const ScreenOrientation = { lock: async () => undefined, unlock: async () => undefined }
