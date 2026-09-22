// Executa um comando SSH no servidor FLOW self-hosted usando credenciais do .env.local.
// Uso: node scripts/ssh-remote.mjs "<comando>"
// As credenciais nunca são impressas. Por padrão o script exige confirmação
// explícita (--yes) para comandos que não sejam somente leitura.
import { Client } from 'ssh2'
import fs from 'node:fs'

const args = process.argv.slice(2)
const cmd = args[0]
const confirmed = args.includes('--yes')

if (!cmd) {
  console.error('uso: node scripts/ssh-remote.mjs "<comando>" [--yes]')
  process.exit(1)
}

const envText = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
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

if (!password) {
  console.error('FLOW_VPS_PASSWORD ausente no .env.local.')
  process.exit(1)
}

const readOnlyHint = /^(ls|cat|head|tail|docker (ps|logs|inspect|top)|docker exec [^|]*?(cat|ls|head|tail|printenv|env|sh -c .?(cat|ls|head|tail|printenv|env))|grep|find|wc|curl|stat|id|whoami|pwd|echo|which|date)\b/i
const isReadOnly = readOnlyHint.test(cmd.trim())
if (!isReadOnly && !confirmed) {
  console.error('Comando potencialmente modificador. Rode novamente com --yes para confirmar.')
  process.exit(2)
}

const conn = new Client()
const timeout = setTimeout(() => {
  console.error('Timeout de SSH (30s).')
  conn.end()
  process.exit(3)
}, 30_000)

conn
  .on('ready', () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        clearTimeout(timeout)
        console.error('SSH exec falhou:', err.message)
        conn.end()
        process.exit(1)
      }
      let stdout = ''
      let stderr = ''
      let code = 0
      stream
        .on('close', (exitCode) => {
          clearTimeout(timeout)
          code = exitCode ?? 0
          if (stdout.trim()) process.stdout.write(stdout)
          if (stderr.trim()) process.stderr.write(stderr)
          conn.end()
          process.exit(code)
        })
        .on('data', (data) => {
          stdout += data.toString()
        })
        .stderr.on('data', (data) => {
          stderr += data.toString()
        })
    })
  })
  .on('error', (error) => {
    clearTimeout(timeout)
    console.error('SSH erro:', error.message)
    process.exit(1)
  })
  .connect({ host, port, username: user, password, readyTimeout: 20_000 })
