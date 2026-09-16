import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { preparePackagedEnv } from './prepare-packaged-env.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const icon = resolve(root, 'build', 'icon.ico')
const downloadDir = resolve(root, 'download')
const releaseDir = resolve(root, 'release')

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

try {
  preparePackagedEnv()
  console.log('Empacotando env de runtime em build/env.local')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

if (!existsSync(icon)) {
  run('npm', ['run', 'icons'])
}

const publish = process.argv.includes('--publish')
run('npm', ['run', 'build'])
run('npx', ['electron-builder', '--win', 'nsis', '--publish', 'never'])

if (publish) {
  run('node', ['scripts/publish-github-release.mjs'])
}

mkdirSync(downloadDir, { recursive: true })

const setups = readdirSync(releaseDir).filter(
  (name) => /^FLOW-Setup-.*\.exe$/i.test(name) && !name.endsWith('.blockmap')
)
if (!setups.length) {
  fail('electron-builder não gerou o Setup.exe em release/')
}

setups.sort((a, b) => statSync(resolve(releaseDir, b)).mtimeMs - statSync(resolve(releaseDir, a)).mtimeMs)
const source = resolve(releaseDir, setups[0])
copyFileSync(source, resolve(downloadDir, setups[0]))
copyFileSync(source, resolve(downloadDir, 'FLOW-Setup.exe'))

const sizeMb = (statSync(resolve(downloadDir, 'FLOW-Setup.exe')).size / (1024 * 1024)).toFixed(1)
console.log(`Instalador pronto: download\\${setups[0]} (${sizeMb} MB)`)
