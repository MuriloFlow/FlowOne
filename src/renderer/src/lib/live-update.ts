import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const MANIFEST_URL = 'https://github.com/MuriloFlow/FlowOne/releases/latest/download/latest-mobile.yml'
const PENDING_KEY = 'flow.mobile.pending-bundle'
const CURRENT_KEY = 'flow.mobile.current-version'

type MobileManifest = {
  version: string
  url: string
  sha512?: string
}

function parseYml(text: string): MobileManifest | null {
  const version = text.match(/^version:\s*['"]?([^\s'"]+)/m)?.[1]
  const path = text.match(/^path:\s*['"]?([^\s'"]+)/m)?.[1]
  const sha512 = text.match(/^sha512:\s*['"]?([^\s'"]+)/m)?.[1]
  const explicitUrl = text.match(/^url:\s*['"]?([^\s'"]+)/m)?.[1]
  if (!version) return null
  const url =
    explicitUrl ||
    (path?.startsWith('http')
      ? path
      : `https://github.com/MuriloFlow/FlowOne/releases/latest/download/${path || 'mobile-www.zip'}`)
  return { version, url, sha512 }
}

function isNewer(remote: string, current: string): boolean {
  const a = remote.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

async function applyPendingWithCapgo(): Promise<boolean> {
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    await CapacitorUpdater.notifyAppReady()
    return true
  } catch {
    return false
  }
}

async function downloadWithCapgo(manifest: MobileManifest): Promise<void> {
  const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
  const bundle = await CapacitorUpdater.download({
    url: manifest.url,
    version: manifest.version
  })
  await CapacitorUpdater.next({ id: bundle.id })
  await Preferences.set({ key: PENDING_KEY, value: manifest.version })
}

export async function runSilentUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  await applyPendingWithCapgo()
  const pending = await Preferences.get({ key: PENDING_KEY })
  if (pending.value) {
    await Preferences.set({ key: CURRENT_KEY, value: pending.value })
    await Preferences.remove({ key: PENDING_KEY })
  }

  void checkAndCacheNextBundle()
}

async function checkAndCacheNextBundle(): Promise<void> {
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) return
    const manifest = parseYml(await response.text())
    if (!manifest) return
    const current = (await Preferences.get({ key: CURRENT_KEY })).value || '0.0.0'
    const pending = (await Preferences.get({ key: PENDING_KEY })).value
    if (pending === manifest.version) return
    if (!isNewer(manifest.version, current)) return
    await downloadWithCapgo(manifest)
  } catch (error) {
    console.warn('[live-update]', error)
  }
}
