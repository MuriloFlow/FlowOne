import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envLocal = resolve(root, '.env.local')
const icon = resolve(root, 'build', 'icon.ico')
const packagedEnv = resolve(root, 'build', 'env.local')
const downloadDir = resolve(root, 'download')
const releaseDir = resolve(root, 'release')

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CARDPLUS_SUPABASE_URL',
  'CARDPLUS_SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY'
]

const skipPack = new Set(['FLOW_BOOTSTRAP_EMAIL', 'FLOW_BOOTSTRAP_PASSWORD'])

function fail(message) {
  console.error(message)
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false'
    }
  })
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} falhou`)
  }
}

if (!existsSync(envLocal)) {
  fail('Falta .env.local — o instalador precisa das chaves da empresa.')
}

const envText = readFileSync(envLocal, 'utf8')
const values = new Map()
for (const raw of envText.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq <= 0) continue
  const key = line.slice(0, eq).trim()
  let value = line.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  values.set(key, value)
}

const missing = required.filter((key) => !values.get(key)?.trim())
if (missing.length) {
  fail(`Variáveis ausentes no .env.local: ${missing.join(', ')}`)
}

mkdirSync(resolve(root, 'build'), { recursive: true })

if (!existsSync(icon)) {
  run('npm', ['run', 'icons'])
}

const packed = [...values.entries()]
  .filter(([key, value]) => value && !skipPack.has(key))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n')

writeFileSync(packagedEnv, `${packed}\n`, 'utf8')
console.log('Empacotando env de runtime em build/env.local')

run('npm', ['run', 'build'])
run('npx', ['electron-builder', '--win', 'nsis', '--publish', 'never'])

mkdirSync(downloadDir, { recursive: true })

const setups = readdirSync(releaseDir).filter(
  (name) => /^FLOW-Setup-.*\.exe$/i.test(name) && !name.endsWith('.blockmap')
)
if (!setups.length) {
  fail('electron-builder não gerou o Setup.exe em release/')
}

setups.sort((a, b) => statSync(resolve(releaseDir, b)).mtimeMs - statSync(resolve(releaseDir, a)).mtimeMs)
const source = resolve(releaseDir, setups[0])
const versioned = resolve(downloadDir, setups[0])
const stable = resolve(downloadDir, 'FLOW-Setup.exe')

copyFileSync(source, versioned)
copyFileSync(source, stable)

const sizeMb = (statSync(stable).size / (1024 * 1024)).toFixed(1)
console.log(`Instalador pronto: download\\${setups[0]} (${sizeMb} MB)`)
console.log('Cópia estável: download\\FLOW-Setup.exe')
