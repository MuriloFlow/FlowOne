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
const RELEASES_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=15`

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '')
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

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FLOW'
    }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function readText(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'FLOW' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

async function latestMobileManifest(): Promise<MobileManifest | null> {
  try {
    const fromYml = parseYml(await readText(MANIFEST_URL))
    if (fromYml?.url) return fromYml
  } catch (error) {
    console.warn('[live-update] manifest', error)
  }

  try {
    const releases = (await readJson(RELEASES_URL)) as GithubRelease[]
    for (const release of releases) {
      if (release.draft || release.prerelease) continue
      const zip = release.assets?.find((asset) => asset.name === 'mobile-www.zip' && asset.browser_download_url)
      const yml = release.assets?.find((asset) => asset.name === 'latest-mobile.yml' && asset.browser_download_url)
      if (!zip?.browser_download_url || !release.tag_name) continue
      if (yml?.browser_download_url) {
        try {
          const parsed = parseYml(await readText(yml.browser_download_url))
          if (parsed) return parsed
        } catch {
          /* usa o zip do release */
        }
      }
      return {
        version: release.tag_name.replace(/^v/i, ''),
        url: zip.browser_download_url
      }
    }
  } catch (error) {
    console.warn('[live-update] github api', error)
  }

  return null
}

async function runningVersion(): Promise<string> {
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    const info = await CapacitorUpdater.current()
    const bundle = info.bundle?.version?.trim()
    if (bundle && bundle !== 'builtin' && bundle !== '0.0.0') return bundle
    if (info.native?.trim()) return info.native.trim()
  } catch {
    /* builtin */
  }
  return '0.0.0'
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
  const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
  const bundle = await CapacitorUpdater.download({
    url: manifest.url,
    version: manifest.version
  })
  try {
    await CapacitorUpdater.set({ id: bundle.id })
  } catch {
    await CapacitorUpdater.next({ id: bundle.id })
    await CapacitorUpdater.reload()
  }
}

async function checkAndApply(): Promise<void> {
  const manifest = await latestMobileManifest()
  if (!manifest) return
  const current = await runningVersion()
  if (!isNewer(manifest.version, current)) return
  await downloadAndApply(manifest)
}

export async function runSilentUpdate(): Promise<void> {
  if (!(await nativePlatform())) return

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    await CapacitorUpdater.notifyAppReady()
  } catch {
    return
  }

  await checkAndApply()

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkAndApply()
  })
}
