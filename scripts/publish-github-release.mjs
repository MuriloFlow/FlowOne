import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const owner = 'MuriloFlow'
const repo = 'FlowOne'
const api = 'https://api.github.com'
const uploads = 'https://uploads.github.com'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function token() {
  const value = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
  if (!value) fail('GH_TOKEN ausente')
  return value
}

function packageVersion() {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  return String(pkg.version)
}

async function github(url, init = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token()}`,
    'User-Agent': 'FLOW-release',
    ...(init.headers ?? {})
  }
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`GitHub ${response.status} ${url}: ${body.slice(0, 400)}`)
  }
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

function latestYml({ version, fileName, sha512, size }) {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${fileName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${fileName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    ''
  ].join('\n')
}

async function downloadBytes(url, accept) {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token()}`,
      'User-Agent': 'FLOW-release'
    },
    redirect: 'follow'
  })
  if (!response.ok) throw new Error(`Download ${response.status} ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

async function getOrCreateRelease(tag, version) {
  try {
    return await github(`${api}/repos/${owner}/${repo}/releases/tags/${tag}`)
  } catch (error) {
    if (!String(error.message).includes('GitHub 404')) throw error
  }
  return github(`${api}/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      draft: false,
      prerelease: false,
      generate_release_notes: false,
      body: `FLOW ${version}`
    })
  })
}

async function upsertAsset(release, fileName, bytes, contentType) {
  const existing = (release.assets ?? []).find((asset) => asset.name === fileName)
  if (existing) {
    await github(`${api}/repos/${owner}/${repo}/releases/assets/${existing.id}`, { method: 'DELETE' })
    release.assets = (release.assets ?? []).filter((asset) => asset.id !== existing.id)
  }
  const url = `${uploads}/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      'User-Agent': 'FLOW-release'
    },
    body: bytes
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Upload ${fileName} ${response.status}: ${body.slice(0, 400)}`)
  }
}

const version = process.argv[2] || process.env.VERSION || packageVersion()
const tag = `v${version}`
const fileName = `FLOW-Setup-${version}.exe`
const blockmapName = `${fileName}.blockmap`
const releaseDir = resolve(root, 'release')
mkdirSync(releaseDir, { recursive: true })

const release = await getOrCreateRelease(tag, version)
let exePath = resolve(releaseDir, fileName)
let exeBytes = existsSync(exePath) ? await readFile(exePath) : null

if (!exeBytes?.length) {
  const asset = (release.assets ?? []).find((item) => item.name === fileName)
  if (!asset) fail(`Instalador ${fileName} não está no release ${tag} nem em release/`)
  console.log(`Baixando ${fileName} (${asset.size} bytes)`)
  exeBytes = await downloadBytes(asset.url, 'application/octet-stream')
  exePath = resolve(tmpdir(), fileName)
  writeFileSync(exePath, exeBytes)
}

const sha512 = createHash('sha512').update(exeBytes).digest('base64')
const yml = latestYml({ version, fileName, sha512, size: exeBytes.length })
writeFileSync(resolve(releaseDir, 'latest.yml'), yml)

const names = new Set((release.assets ?? []).map((asset) => asset.name))
if (!names.has(fileName)) {
  console.log(`Enviando ${fileName}`)
  await upsertAsset(release, fileName, exeBytes, 'application/octet-stream')
}

console.log('Enviando latest.yml')
await upsertAsset(release, 'latest.yml', Buffer.from(yml, 'utf8'), 'application/octet-stream')

const blockmapPath = resolve(releaseDir, blockmapName)
if (existsSync(blockmapPath)) {
  console.log(`Enviando ${blockmapName}`)
  await upsertAsset(release, blockmapName, await readFile(blockmapPath), 'application/octet-stream')
}

console.log(`Release ${tag} pronto: ${fileName} + latest.yml`)
