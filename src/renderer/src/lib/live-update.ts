type MobileManifest = {
  version: string
  url: string
}

type GithubRelease = {
  draft?: boolean
  prerelease?: boolean
  tag_name?: string
  assets?: Array<{ name?: string; browser_download_url?: string }>
}

const OWNER = 'MuriloFlow'
const REPO = 'FlowOne'
const MANIFEST_URL = `https://github.com/${OWNER}/${REPO}/releases/latest/download/latest-mobile.yml`
const RELEASES_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=20`
const LAST_KEY = 'flow.mobile.applied-version'

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '')
}

function asText(data: unknown): string {
  if (typeof data === 'string') return data
  if (data == null) return ''
  return JSON.stringify(data)
}

function parseYml(text: string): MobileManifest | null {
  const source = stripBom(text)
  const version = source.match(/^version:\s*['"]?([^\s'"]+)/m)?.[1]
  const path = source.match(/^path:\s*['"]?([^\s'"]+)/m)?.[1]
  const explicitUrl = source.match(/^url:\s*['"]?([^\s'"]+)/m)?.[1]
  if (!version) return null
  const url =
    explicitUrl ||
    (path?.startsWith('http')
      ? path
      : `https://github.com/${OWNER}/${REPO}/releases/latest/download/${path || 'mobile-www.zip'}`)
  return { version, url }
}

function isNewer(remote: string, current: string): boolean {
  const left = remote.replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
  const right = current.replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
  const size = Math.max(left.length, right.length)
  for (let index = 0; index < size; index += 1) {
    if ((left[index] ?? 0) > (right[index] ?? 0)) return true
    if ((left[index] ?? 0) < (right[index] ?? 0)) return false
  }
  return false
}

async function nativeGet(url: string, accept?: string): Promise<string> {
  try {
    const { CapacitorHttp } = await import('@capacitor/core')
    const response = await CapacitorHttp.get({
      url,
      headers: {
        Accept: accept || '*/*',
        'User-Agent': 'FLOW',
        'Cache-Control': 'no-cache'
      },
      connectTimeout: 15_000,
      readTimeout: 20_000,
      responseType: 'text'
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }
    return asText(response.data)
  } catch {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: accept || '*/*',
        'User-Agent': 'FLOW'
      }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  }
}

async function latestMobileManifest(): Promise<MobileManifest | null> {
  try {
    const releases = JSON.parse(await nativeGet(RELEASES_URL, 'application/vnd.github+json')) as GithubRelease[]
    for (const release of releases) {
      if (release.draft || release.prerelease) continue
      const zip = release.assets?.find((asset) => asset.name === 'mobile-www.zip' && asset.browser_download_url)
      const yml = release.assets?.find((asset) => asset.name === 'latest-mobile.yml' && asset.browser_download_url)
      if (!zip?.browser_download_url) continue
      if (yml?.browser_download_url) {
        try {
          const parsed = parseYml(await nativeGet(yml.browser_download_url))
          if (parsed) return { ...parsed, url: parsed.url || zip.browser_download_url }
        } catch {
          /* zip do release */
        }
      }
      if (release.tag_name) {
        return {
          version: release.tag_name.replace(/^v/i, ''),
          url: zip.browser_download_url
        }
      }
    }
  } catch (error) {
    console.warn('[live-update] github api', error)
  }

  try {
    const fromYml = parseYml(await nativeGet(MANIFEST_URL))
    if (fromYml?.url) return fromYml
  } catch (error) {
    console.warn('[live-update] manifest', error)
  }

  return null
}

async function runningVersion(): Promise<string> {
  const versions: string[] = []
  try {
    const { Preferences } = await import('@capacitor/preferences')
    const stored = (await Preferences.get({ key: LAST_KEY })).value
    if (stored) versions.push(stored)
  } catch {
    /* ignore */
  }
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    const info = await CapacitorUpdater.current()
    const bundle = info.bundle?.version?.trim()
    if (bundle && bundle !== 'builtin') versions.push(bundle)
    if (info.native?.trim()) versions.push(info.native.trim())
  } catch {
    /* builtin */
  }
  return versions.reduce((best, next) => (isNewer(next, best) ? next : best), '0.0.0')
}

async function nativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

let applying = false

async function downloadAndApply(manifest: MobileManifest): Promise<void> {
  if (applying) return
  applying = true
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    const bundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version
    })
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key: LAST_KEY, value: manifest.version })
    } catch {
      /* segue */
    }
    await CapacitorUpdater.set({ id: bundle.id })
  } catch (error) {
    applying = false
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.remove({ key: LAST_KEY })
    } catch {
      /* ignore */
    }
    try {
      const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
      const bundle = await CapacitorUpdater.download({
        url: manifest.url,
        version: manifest.version
      })
      await CapacitorUpdater.next({ id: bundle.id })
      await CapacitorUpdater.reload()
    } catch (fallbackError) {
      console.warn('[live-update] apply', error, fallbackError)
    }
  }
}

async function checkAndApply(): Promise<void> {
  try {
    const manifest = await latestMobileManifest()
    if (!manifest) return
    const current = await runningVersion()
    if (!isNewer(manifest.version, current)) return
    await downloadAndApply(manifest)
  } catch (error) {
    console.warn('[live-update] check', error)
  }
}

export async function runSilentUpdate(): Promise<void> {
  if (!(await nativePlatform())) return

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    await CapacitorUpdater.notifyAppReady()
  } catch {
    /* o update ainda pode rodar */
  }

  await checkAndApply()

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkAndApply()
  })

  try {
    const { App } = await import('@capacitor/app')
    await App.addListener('resume', () => {
      void checkAndApply()
    })
  } catch {
    /* webview sem plugin */
  }

  window.setInterval(() => {
    void checkAndApply()
  }, 30_000)
}
