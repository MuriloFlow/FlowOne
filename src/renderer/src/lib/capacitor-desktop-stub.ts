export const Capacitor = {
  isNativePlatform: () => false
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

export const Directory = { Cache: 'CACHE' }
export const Filesystem = { writeFile: async () => ({ uri: '' }) }
export const Share = { share: async () => undefined }
export const ScreenOrientation = { lock: async () => undefined, unlock: async () => undefined }
