// Deploy dos sites públicos do RH Inteligente:
//   public-portal/dist  → /opt/flow-portal/rh/digaspi   (rh.flwdesk.com/digaspi)
//   public-jobs/dist    → /opt/flow-portal/rh/vagas-site (vagas.flwdesk.com)
// + Caddy: /digaspi e /digaspi/* (com ou sem barra), redirect rh.flwdesk.com →
//   vagas.flwdesk.com, bloco vagas + rhinteligente.db (proxy API do board).
// Uso: node scripts/deploy-rh-sites.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'ssh2'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const raw of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const cut = line.indexOf('=')
  env[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
}

const conn = new Client()
conn
  .on('ready', () => {
    uploadDir(path.join(root, 'public-portal/dist'), '/opt/flow-portal/rh/digaspi')
      .then(() => uploadDir(path.join(root, 'public-jobs/dist'), '/opt/flow-portal/rh/vagas-site'))
      .then(patchCaddy)
      .then(reloadCaddy)
      .then(test)
      .then(done)
      .catch((error) => {
        console.error('ERRO:', error.message)
        process.exit(1)
      })
  })
  .on('error', (error) => {
    console.error('SSH erro:', error.message)
    process.exit(1)
  })
  .connect({
    host: env.FLOW_VPS_HOST || '2.25.237.179',
    port: Number(env.FLOW_VPS_PORT || 22),
    username: env.FLOW_VPS_USER || 'root',
    password: env.FLOW_VPS_PASSWORD,
    readyTimeout: 20_000
  })

function run(command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (error, stream) => {
      if (error) return reject(error)
      let out = ''
      let err = ''
      stream.on('data', (data) => {
        out += String(data)
      })
      stream.stderr.on('data', (data) => {
        err += String(data)
      })
      stream.on('close', (code) => resolve({ code, out, err }))
    })
  })
}

async function uploadDir(localDir, remoteDir) {
  const files = []
  collect(localDir, '')
  for (const rel of files) {
    const local = path.join(localDir, rel)
    const remote = `${remoteDir}/${rel.split('\\').join('/')}`
    const parent = remote.slice(0, remote.lastIndexOf('/'))
    await run(`mkdir -p '${parent}'`)
    await new Promise((resolve, reject) => {
      conn.sftp((error, sftp) => {
        if (error) return reject(error)
        sftp.fastPut(local, remote, (putError) => {
          if (putError) return reject(putError)
          resolve()
        })
      })
    })
  }
  console.log(`upload ok: ${remoteDir} (${files.length} arquivos)`)

  function collect(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) collect(path.join(dir, entry.name), rel)
      else files.push(rel)
    }
  }
}

const CADDY_BLOCK = `
# Job board publico (vagas.flwdesk.com)
http://vagas.flwdesk.com, https://vagas.flwdesk.com {
	import secure_headers
	encode gzip
	root * /usr/share/caddy/rh/vagas-site
	try_files {path} /index.html
	file_server
}

# API do job board (rhinteligente.db.flwdesk.com → flowone REST/Auth/Storage)
http://rhinteligente.db.flwdesk.com, https://rhinteligente.db.flwdesk.com {
	import api_core rest-flowone-app:3000 auth-flowone-app:9999
	handle /functions/v1* {
		uri strip_prefix /functions/v1
		reverse_proxy supabase-edge-functions:9000
	}
}

# Redirect raiz do RH → job board (rh.flwdesk.com sem /digaspi)
http://rh.flwdesk.com, https://rh.flwdesk.com {
	import secure_headers
	@root path /
	redir @root https://vagas.flwdesk.com/ permanent
	@notdigaspi not path /digaspi*
	redir @notdigaspi https://vagas.flwdesk.com{uri} permanent
	encode gzip
	root * /usr/share/caddy/rh
	try_files {path} /digaspi/index.html
	file_server
}
`

async function patchCaddy() {
  // O Caddyfile REAL vive no HOST (/opt/supabase-src/docker/Caddyfile.projects),
  // bind-mountado no container. Escrever /etc/caddy/Caddyfile dentro do
  // container falha (read-only fs).
  const HOST_FILE = '/opt/supabase-src/docker/Caddyfile.projects'
  const check = await run(`grep -c "vagas.flwdesk.com" ${HOST_FILE} || true`)
  if (Number(check.out.trim() || '0') > 0) {
    console.log('caddy: blocos novos já presentes')
    return
  }
  await run(`cp ${HOST_FILE} ${HOST_FILE}.bak-$(date +%s)`)
  const result = await run(`cat >> ${HOST_FILE} <<'CADDY_EOF'
${CADDY_BLOCK}
CADDY_EOF`)
  if (result.code !== 0) throw new Error(`append caddy: ${result.err}`)
  console.log('caddy: blocos adicionados ao Caddyfile.projects (host)')
}

async function reloadCaddy() {
  const validate = await run('docker exec project-gw caddy validate --config /etc/caddy/Caddyfile 2>&1')
  if (validate.code !== 0) {
    // Rollback: remove o que foi anexado
    console.error('caddy inválido — removendo blocos novos')
    await run(
      `sed -i "/# Job board publico (vagas.flwdesk.com)/,\$d" /opt/supabase-src/docker/Caddyfile.projects`
    )
    throw new Error(`caddy validate: ${validate.out} ${validate.err}`)
  }
  const reload = await run('docker exec project-gw caddy reload --config /etc/caddy/Caddyfile 2>&1')
  if (reload.code !== 0) throw new Error(`caddy reload: ${reload.err}`)
  console.log('caddy: reload ok')
}

async function test() {
  const digaspi = await run('curl -s -o /dev/null -w "%{http_code}" https://rh.flwdesk.com/digaspi')
  const root = await run(
    'curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://rh.flwdesk.com/'
  )
  const vagas = await run('curl -s -o /dev/null -w "%{http_code}" https://vagas.flwdesk.com/')
  const api = await run(
    'curl -s -o /dev/null -w "%{http_code}" https://rhinteligente.db.flwdesk.com/rest/v1/ -H "apikey: invalid"'
  )
  console.log('tests: /digaspi', digaspi.out.trim(), '| rh/', root.out.trim(), '| vagas/', vagas.out.trim(), '| api/', api.out.trim())
}

function done() {
  console.log('DEPLOY SITES OK')
  conn.end()
  process.exit(0)
}
