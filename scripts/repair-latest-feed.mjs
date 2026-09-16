import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const owner = 'MuriloFlow'
const repo = 'FlowOne'
const api = 'https://api.github.com'
const uploads = 'https://uploads.github.com'

function token() {
  const value = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim()
  if (!value) throw new Error('GH_TOKEN ausente')
  return value
}

async function github(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'User-Agent': 'FLOW-release',
      ...(init.headers ?? {})
    }
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`GitHub ${response.status} ${url}: ${body.slice(0, 300)}`)
  }
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function downloadAsset(asset) {
  const response = await fetch(asset.url, {
    headers: {
      Accept: 'application/octet-stream',
      Authorization: `Bearer ${token()}`,
      'User-Agent': 'FLOW-release'
    },
    redirect: 'follow'
  })
  if (!response.ok) throw new Error(`Download ${asset.name} ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function upsertAsset(release, fileName, bytes) {
  const existing = (release.assets ?? []).find((asset) => asset.name === fileName)
  if (existing) {
    await github(`${api}/repos/${owner}/${repo}/releases/assets/${existing.id}`, { method: 'DELETE' })
    release.assets = (release.assets ?? []).filter((asset) => asset.id !== existing.id)
  }
  const response = await fetch(
    `${uploads}/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'User-Agent': 'FLOW-release'
      },
      body: bytes
    }
  )
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Upload ${fileName} ${response.status}: ${body.slice(0, 300)}`)
  }
}

const sourceTag = process.argv[2] || 'v1.1.6'
const destTag = process.argv[3] || 'v1.1.5'
const source = await github(`${api}/repos/${owner}/${repo}/releases/tags/${sourceTag}`)
const dest = await github(`${api}/repos/${owner}/${repo}/releases/tags/${destTag}`)
const ymlAsset = source.assets.find((asset) => asset.name === 'latest.yml')
const exeAsset = source.assets.find((asset) => asset.name.endsWith('.exe') && !asset.name.endsWith('.blockmap'))
if (!ymlAsset || !exeAsset) throw new Error(`Release ${sourceTag} sem latest.yml ou exe`)

console.log(`Espelhando ${exeAsset.name} + latest.yml de ${sourceTag} → ${destTag}`)
const yml = await downloadAsset(ymlAsset)
const exe = await downloadAsset(exeAsset)
writeFileSync(resolve(tmpdir(), exeAsset.name), exe)
await upsertAsset(dest, exeAsset.name, exe)
await upsertAsset(dest, 'latest.yml', yml)
console.log(`Feed ${destTag} agora anuncia ${yml.toString('utf8').split('\n')[0]}`)
