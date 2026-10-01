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

import { operations } from '@/lib/operations'

const OWNER = 'MuriloFlow'
const REPO = 'FlowOne'
const MANIFEST_URL = `https://github.com/${OWNER}/${REPO}/releases/latest/download/latest-mobile.yml`
const RELEASES_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=20`
const LAST_KEY = 'flow.mobile.applied-version'
const ROLLBACK_KEY = 'flow.mobile.rollback-count'
const OTA_ERROR_KEY = 'flow.mobile.ota-error'
// Direto: o zip mais recente sem passar pela API do GitHub (que tem limite
// anônimo de 60 req/h e derrubava a checagem com o polling).
const LATEST_ZIP_URL = `https://github.com/${OWNER}/${REPO}/releases/latest/download/mobile-www.zip`

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
  // 1º caminho (rápido, sem API): o latest-mobile.yml do release vigente.
  // /releases/latest/download/ segue redirect e não conta no rate limit.
  try {
    const fromYml = parseYml(await nativeGet(MANIFEST_URL))
    if (fromYml?.url) return fromYml
  } catch (error) {
    console.warn('[live-update] manifest', error)
  }

  // 2º caminho: API de releases (quando o yml falha).
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

  // 3º caminho: baixa o zip direto e descobre a versão depois (não usado
  // para decidir, só como último recurso com versão desconhecida).
  try {
    const probe = await nativeGet(LATEST_ZIP_URL, 'application/zip')
    if (probe && probe.length > 0) {
      // Sem versão confiável, deixa os outros caminhos decidirem depois.
      console.warn('[live-update] zip direto alcançável, mas sem versão — aguardando yml')
    }
  } catch {
    /* sem rede */
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

// Uma tentativa que falha não pode travar as próximas por 15 minutos e não
// pode disparar downloads repetidos em milessimos: guardamos a última
// tentativa com resultado.
const ATTEMPT_COOLDOWN_MS = 60 * 1000
let lastAttemptAt = 0
let lastFailureAt = 0
let pendingReload = false

// O plugin do updater pode travar (WebView antigo, zip corrompido); se o
// download não concluir em 90s, abortamos a rodada e liberamos a próxima.
const DOWNLOAD_TIMEOUT_MS = 90 * 1000

async function downloadAndApply(manifest: MobileManifest): Promise<void> {
  if (applying) return
  applying = true
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    let bundle
    try {
      bundle = await CapacitorUpdater.download({
        url: manifest.url,
        version: manifest.version
      })
    } catch (primaryError) {
      // A URL do manifest pode estar indisponível: tenta o zip do release
      // "latest" direto antes de desistir.
      if (manifest.url === LATEST_ZIP_URL) throw primaryError
      bundle = await CapacitorUpdater.download({
        url: LATEST_ZIP_URL,
        version: manifest.version
      })
    }
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key: LAST_KEY, value: manifest.version })
      await Preferences.remove({ key: OTA_ERROR_KEY })
    } catch {
      /* segue */
    }
    // next() sóagenda o bundle: ele entra na PRÓXIMA inicialização. Para o
    // usuário não precisar fechar e abrir o app, recarregamos na hora —
    // é isso que fazia "não aparecer a notificação/atualização".
    await CapacitorUpdater.next({ id: bundle.id })
    pendingReload = true
    window.setTimeout(() => {
      try {
        (window.location as unknown as { reload: () => void }).reload()
      } catch {
        /* alguns WebViews recusam; o update aplica no próximo open */
      }
    }, 1200)
  } catch (error) {
    lastFailureAt = Date.now()
    console.warn('[live-update] apply', error)
    // Diagnóstico visível na telemetria (flow_device_pings.device_label).
    try {
      const { Preferences } = await import('@capacitor/preferences')
      const message = error instanceof Error ? error.message : String(error)
      await Preferences.set({
        key: OTA_ERROR_KEY,
        value: `ota ${manifest.version} falhou: ${message.slice(0, 110)}`
      })
    } catch {
      /* sem Preferences: segue */
    }
  } finally {
    applying = false
  }
}

/**
 * AUTO-CURA: bundle em 'builtin' significa que o plugin fez rollback do OTA
 * (bundle quebrado ou crash). Sem o reset, o plugin recusa reinstalar a MESMA
 * versão e o aparelho fica preso para sempre na versão antiga — é exatamente
 * o bug que fazia "a atualização nunca chegar". Retorna a versão que estava
 * armazenada (quando havia) ou null se o bundle está saudável.
 */
async function resetIfRolledBack(): Promise<string | null> {
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    const { Preferences } = await import('@capacitor/preferences')
    const info = await CapacitorUpdater.current()
    const bundle = info.bundle?.version?.trim()
    if (!bundle || bundle === 'builtin') {
      const stored = (await Preferences.get({ key: LAST_KEY })).value
      await CapacitorUpdater.reset().catch(() => undefined)
      if (stored) await Preferences.remove({ key: LAST_KEY })
      console.warn('[live-update] bundle em builtin — reset feito para permitir reinstalar')
      return stored || ''
    }
  } catch {
    /* plugin indisponível: segue o fluxo normal */
  }
  return null
}

async function rollbackInfoFor(version: string): Promise<{ count: number; at: number }> {
  try {
    const { Preferences } = await import('@capacitor/preferences')
    const raw = (await Preferences.get({ key: ROLLBACK_KEY })).value
    const parsed = raw
      ? (JSON.parse(raw) as { version?: string; count?: number; at?: number })
      : null
    if (!parsed || parsed.version !== version) return { count: 0, at: 0 }
    return { count: Number(parsed.count) || 0, at: Number(parsed.at) || 0 }
  } catch {
    return { count: 0, at: 0 }
  }
}

async function rollbackCountFor(version: string): Promise<number> {
  return (await rollbackInfoFor(version)).count
}

async function bumpRollbackCount(version: string): Promise<void> {
  if (!version) return
  try {
    const { Preferences } = await import('@capacitor/preferences')
    const count = (await rollbackCountFor(version)) + 1
    await Preferences.set({
      key: ROLLBACK_KEY,
      value: JSON.stringify({ version, count, at: Date.now() })
    })
  } catch {
    /* ignore */
  }
}

/** Telemetria: reporta a versão rodando (best-effort; falha antes do login é normal). */
async function reportMobileVersion(): Promise<void> {
  try {
    const appVersion = await runningVersion()
    if (appVersion === '0.0.0') return
    // device_label carrega o bundle ativo e o último erro de OTA (se houver):
    // é assim que a frota fica diagnosticável sem acesso ao aparelho.
    let label = 'FLOW Mobile'
    try {
      const { Preferences } = await import('@capacitor/preferences')
      const bundle = (await Preferences.get({ key: LAST_KEY })).value
      label = `FLOW Mobile · bundle ${bundle || appVersion}`
      const errorRaw = (await Preferences.get({ key: OTA_ERROR_KEY })).value
      if (errorRaw) label += ` · ${errorRaw}`
    } catch {
      /* segue com o label padrão */
    }
    await operations().reportAppVersion({
      platform: 'MOBILE',
      appVersion,
      deviceLabel: label.slice(0, 180)
    })
  } catch {
    /* sem sessão ainda — tenta na próxima checagem */
  }
}

/** Versão mínima imposta pelo servidor: se bloqueou, força checagem agora. */
async function enforceMinVersion(): Promise<void> {
  try {
    const appVersion = await runningVersion()
    const policy = await operations().getReleasePolicy({ platform: 'MOBILE', appVersion })
    if (policy.block) {
      console.warn('[live-update] versão mínima', policy.minVersion, '— forçando atualização')
      lastAttemptAt = 0
      lastFailureAt = 0
      await checkAndApply()
    }
  } catch {
    /* antes do login falha silenciosamente */
  }
}

async function checkAndApply(): Promise<void> {
  if (pendingReload) return
  const now = Date.now()
  if (now - lastAttemptAt < ATTEMPT_COOLDOWN_MS) return
  if (now - lastFailureAt < ATTEMPT_COOLDOWN_MS) return
  lastAttemptAt = now
  try {
    const manifest = await latestMobileManifest()
    if (!manifest) return
    const rolledBackFrom = await resetIfRolledBack()
    if (rolledBackFrom !== null) {
      await bumpRollbackCount(rolledBackFrom)
      const rollback = await rollbackInfoFor(manifest.version)
      // 2 rollbacks travam a versão — mas só por 24h: se o crash foi
      // transitório (zip corrompido no download, por ex.), o aparelho não
      // fica preso para sempre esperando uma versão nova.
      if (rollback.count >= 2 && Date.now() - rollback.at < 24 * 60 * 60_000) {
        console.warn('[live-update]', manifest.version, 'rollbackou 2x — nova tentativa em até 24h')
        return
      }
    }
    const current = await runningVersion()
    if (!isNewer(manifest.version, current)) {
      void reportMobileVersion()
      return
    }
    // A checagem não pode ficar presa num download lento: timeout de 90s.
    await Promise.race([
      downloadAndApply(manifest),
      new Promise((resolve) => window.setTimeout(() => resolve('timeout'), DOWNLOAD_TIMEOUT_MS))
    ])
    void reportMobileVersion()
  } catch (error) {
    lastFailureAt = Date.now()
    console.warn('[live-update] check', error)
  }
}

export async function runSilentUpdate(): Promise<void> {
  if (!(await nativePlatform())) return

  // O notifyAppReady valida o bundle novo logo na primeira execução. Em
  // Cold Start pesado ele pode ser chamado cedo demais; repetir por alguns
  // segundos garante que o rollback não dispare por engano.
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    await CapacitorUpdater.notifyAppReady()
    for (const delay of [2_000, 5_000, 10_000]) {
      window.setTimeout(() => {
        void CapacitorUpdater.notifyAppReady().catch(() => undefined)
      }, delay)
    }
  } catch {
    /* o update ainda pode rodar */
  }

  await checkAndApply()
  // Política de versão mínima + telemetria: roda depois (pode falhar antes do login).
  window.setTimeout(() => {
    void enforceMinVersion()
    void reportMobileVersion()
  }, 3_000)

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
  }, 90_000)
  // Política/telemetria reavaliadas a cada 5 min (pega login tardio).
  window.setInterval(() => {
    void enforceMinVersion()
    void reportMobileVersion()
  }, 300_000)
}
