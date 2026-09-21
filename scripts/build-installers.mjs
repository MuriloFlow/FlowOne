import { createHash } from 'node:crypto'
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const downloadDir = path.join(root, 'download')
const mobileDir = path.join(root, 'mobile')
const onlyMobile = process.argv.includes('--mobile')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const mobilePkg = JSON.parse(fs.readFileSync(path.join(mobileDir, 'package.json'), 'utf8'))
const version = String(mobilePkg.version || pkg.version || '1.0.0')

fs.mkdirSync(downloadDir, { recursive: true })

function run(command, cwd = root, extraEnv = {}) {
  console.log(`$ ${command}`)
  execSync(command, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } })
}

function hasJava() {
  const result = spawnSync('java', ['-version'], { encoding: 'utf8' })
  return result.status === 0
}

function androidHome() {
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || ''
}

if (!onlyMobile) {
  const envOk = Boolean(process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (envOk) {
    try {
      run('npm run dist')
      const exe = path.join(root, 'release', `FLOW-Setup-${version}.exe`)
      if (fs.existsSync(exe)) {
        fs.copyFileSync(exe, path.join(downloadDir, `FLOW-Setup-${version}.exe`))
        console.log(`copied ${exe}`)
      }
    } catch (error) {
      console.warn('Desktop installer skipped:', error instanceof Error ? error.message : error)
    }
  } else {
    console.warn('Desktop installer skipped: missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in this machine env.')
  }
}

if (!fs.existsSync(path.join(mobileDir, 'node_modules'))) {
  run('npm ci', mobileDir)
}
run('npm run build', mobileDir)

try {
  run('npx cap sync android', mobileDir)
} catch {
  console.warn('cap sync android failed — run npx cap add android first.')
}

try {
  run('npx cap sync ios', mobileDir)
} catch {
  console.warn('cap sync ios failed — run npx cap add ios first.')
}

try {
  run('node scripts/package-ios.mjs', root)
} catch (error) {
  console.warn('iOS package skipped:', error instanceof Error ? error.message : error)
}

const sdk = androidHome()
let apkCopied = false
if (sdk && hasJava()) {
  const gradlew = path.join(mobileDir, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
  if (fs.existsSync(gradlew)) {
    try {
      run(`${process.platform === 'win32' ? 'gradlew.bat' : './gradlew'} assembleRelease`, path.join(mobileDir, 'android'), {
        ANDROID_HOME: sdk,
        ANDROID_SDK_ROOT: sdk
      })
      const apk = path.join(mobileDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk')
      const signed = path.join(mobileDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
      const debugApk = path.join(mobileDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
      const source = [signed, apk, debugApk].find((file) => fs.existsSync(file))
      if (source) {
        const destName = source.includes('debug') ? `FLOW-${version}-debug.apk` : `FLOW-${version}.apk`
        fs.copyFileSync(source, path.join(downloadDir, destName))
        console.log(`APK -> download/${destName}`)
        apkCopied = true
      }
    } catch (error) {
      console.warn('Android assemble skipped:', error instanceof Error ? error.message : error)
    }
  }
}

if (!apkCopied) {
  console.warn('APK not produced. Install JDK 17 + Android SDK, then rerun npm run dist:mobile.')
}

const dist = path.join(mobileDir, 'dist')
if (fs.existsSync(dist) && !fs.existsSync(path.join(downloadDir, 'mobile-www.zip'))) {
  const zipName = 'mobile-www.zip'
  const zipPath = path.join(downloadDir, zipName)
  try {
    if (process.platform === 'win32') {
      run(
        `powershell -NoProfile -Command "Compress-Archive -Path '${dist}\\*' -DestinationPath '${zipPath}' -Force"`
      )
    }
    if (fs.existsSync(zipPath)) {
      const buf = fs.readFileSync(zipPath)
      const sha512 = createHash('sha512').update(buf).digest('base64')
      const yml = [
        `version: ${version}`,
        `path: ${zipName}`,
        `sha512: ${sha512}`,
        `url: https://github.com/MuriloFlow/FlowOne/releases/latest/download/${zipName}`,
        `releaseDate: ${new Date().toISOString()}`,
        ''
      ].join('\n')
      fs.writeFileSync(path.join(downloadDir, 'latest-mobile.yml'), yml)
    }
  } catch (error) {
    console.warn('mobile-www.zip skipped:', error instanceof Error ? error.message : error)
  }
}

console.log(`Installers folder: ${downloadDir}`)
