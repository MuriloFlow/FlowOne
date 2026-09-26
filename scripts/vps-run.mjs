// Executa um comando na VPS FLOW via SSH (senha de .env.local, nunca no repo).
//
// Uso:
//   node scripts/vps-run.mjs "docker ps --format '{{.Names}}'"
//   echo "script" | node scripts/vps-run.mjs -
//
// Tudo que o comando imprime no stdout é repassado; stderr idem. Saída de
// segredos é responsabilidade de quem chama — evite printenv com valores.
import { Client } from 'ssh2'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const envText = fs.readFileSync(path.join(root, '.env.local'), 'utf8')
const env = {}
for (const raw of envText.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const cut = line.indexOf('=')
  env[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
}

const host = env.FLOW_VPS_HOST || '2.25.237.179'
const port = Number(env.FLOW_VPS_PORT || 22)
const user = env.FLOW_VPS_USER || 'root'
const password = env.FLOW_VPS_PASSWORD
if (!password) throw new Error('FLOW_VPS_PASSWORD ausente no .env.local')

const command = process.argv[2] === '-' ? fs.readFileSync(0, 'utf8') : process.argv[2]
if (!command?.trim()) {
  console.error('Uso: node scripts/vps-run.mjs "comando"  (ou "-" para ler o script do stdin)')
  process.exit(1)
}

const conn = new Client()
conn
  .on('ready', () => {
    conn.exec(command, (err, stream) => {
      if (err) {
        console.error('SSH exec erro:', err.message)
        process.exit(1)
      }
      let code = 0
      stream
        .on('close', (exitCode) => {
          code = exitCode ?? 0
          conn.end()
          process.exit(code)
        })
        .on('data', (data) => process.stdout.write(data))
        .stderr.on('data', (data) => process.stderr.write(data))
    })
  })
  .on('error', (error) => {
    console.error('SSH erro:', error.message)
    process.exit(1)
  })
  .connect({ host, port, username: user, password, readyTimeout: 20_000 })
