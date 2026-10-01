// Deploy dos sites públicos do RH Inteligente:
//   public-portal/dist  → /opt/flow-portal/rh/digaspi    (rh.flwdesk.com/digaspi)
//   public-jobs/dist    → /opt/flow-portal/rh/vagas-site (recruta.flwdesk.com)
// + Caddy: Recruta+ em recruta.flwdesk.com / recruta.db.flwdesk.com,
//   redirects de vagas.* e rh.flwdesk.com → recruta.flwdesk.com (exceto
//   /digaspi, que é o portal do cliente), proxy API do board.
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

// Marcador do bloco que ESTE script gerencia no fim do Caddyfile.projects:
// tudo a partir dele é reescrito a cada deploy (idempotente).
const CADDY_MARKER = '# Job board publico (vagas.flwdesk.com)'
const CADDY_MARKER_NEW = '# Recruta+ (job board publico) — canonico'

const CADDY_TAIL = `
${CADDY_MARKER_NEW}
http://recruta.flwdesk.com, https://recruta.flwdesk.com {
	import secure_headers
	encode gzip
	root * /usr/share/caddy/rh/vagas-site
	try_files {path} /index.html
	file_server
}

# Recruta+ por recruta.db.flwdesk.com (DNS *.db.flwdesk.com → VPS)
http://recruta.db.flwdesk.com, https://recruta.db.flwdesk.com {
	import secure_headers
	encode gzip
	root * /usr/share/caddy/rh/vagas-site
	try_files {path} /index.html
	file_server
}

# vagas.* → Recruta+ (links antigos continuam funcionando)
http://vagas.flwdesk.com, https://vagas.flwdesk.com {
	import secure_headers
	redir https://recruta.flwdesk.com{uri} permanent
}

http://vagas.db.flwdesk.com, https://vagas.db.flwdesk.com {
	import secure_headers
	redir https://recruta.flwdesk.com{uri} permanent
}

# API do job board (rhinteligente.db.flwdesk.com → flowone REST/Auth/Storage)
http://rhinteligente.db.flwdesk.com, https://rhinteligente.db.flwdesk.com {
	import api_core rest-flowone-app:3000 auth-flowone-app:9999
	handle /functions/v1* {
		uri strip_prefix /functions/v1
		reverse_proxy supabase-edge-functions:9000
	}
}

# rh.flwdesk.com → Recruta+ (exceto /digaspi = portal do cliente)
http://rh.flwdesk.com, https://rh.flwdesk.com {
	import secure_headers
	@root path /
	redir @root https://recruta.flwdesk.com/ permanent
	@notdigaspi not path /digaspi*
	redir @notdigaspi https://recruta.flwdesk.com{uri} permanent
	encode gzip
	root * /usr/share/caddy/rh
	try_files {path} /digaspi/index.html
	file_server
}
`

async function patchCaddy() {
  // O Caddyfile REAL vive no HOST (/opt/supabase-src/docker/Caddyfile.projects),
  // bind-mountado de ARQUIVO no container. NUNCA usar `sed -i` (troca o inode e
  // o container fica órfão do conteúdo antigo): editar com `cat tmp > file`
  // (mesmo inode) e conferir o conteúdo DENTRO do container.
  const HOST_FILE = '/opt/supabase-src/docker/Caddyfile.projects'
  const current = await run(`cat ${HOST_FILE}`)
  const content = current.out

  if (content.includes(CADDY_MARKER_NEW) && content.includes('recruta.db.flwdesk.com')) {
    console.log('caddy: blocos do Recruta+ já presentes')
  } else {
    // Reescreve TODO o bloco gerenciado (do marcador até o fim do arquivo),
    // preservando o inode: escreve em /tmp e sobrescreve com `cat tmp > file`.
    const cut = content.indexOf(CADDY_MARKER)
    const head = cut >= 0 ? content.slice(0, cut) : content.replace(/\s*$/, '\n\n')
    await run(`cp ${HOST_FILE} ${HOST_FILE}.bak-$(date +%s)`)
    const tmp = '/tmp/Caddyfile.projects.recruta'
    await new Promise((resolve, reject) => {
      conn.sftp((error, sftp) => {
        if (error) return reject(error)
        sftp.writeFile(tmp, `${head}${CADDY_TAIL}`, (writeError) =>
          writeError ? reject(writeError) : resolve()
        )
      })
    })
    const result = await run(`cat ${tmp} > ${HOST_FILE}`)
    if (result.code !== 0) throw new Error(`write caddy: ${result.err}`)
    console.log('caddy: bloco do Recruta+ gravado no Caddyfile.projects (host)')
  }

  // O container vê o inode do bind; se divergir do host, reinicia o Caddy
  // (re-resolve o bind) antes do validate/reload.
  const hostHash = await run(`md5sum ${HOST_FILE} | cut -d' ' -f1`)
  const containerHash = await run(
    `docker exec project-gw md5sum /etc/caddy/Caddyfile | cut -d' ' -f1`
  )
  if (hostHash.out.trim() !== containerHash.out.trim()) {
    console.log('caddy: bind divergente (inode) — reiniciando project-gw')
    await run('docker restart project-gw')
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
}

async function reloadCaddy() {
  const validate = await run('docker exec project-gw caddy validate --config /etc/caddy/Caddyfile 2>&1')
  if (validate.code !== 0) {
    // Rollback: restaura o backup mais recente (mantendo o inode via cat).
    console.error('caddy inválido — restaurando backup')
    await run(
      'ls -t /opt/supabase-src/docker/Caddyfile.projects.bak-* 2>/dev/null | head -1 | xargs -r -I{} sh -c "cat {} > /opt/supabase-src/docker/Caddyfile.projects"'
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
  const recruta = await run('curl -s -o /dev/null -w "%{http_code}" https://recruta.flwdesk.com/')
  const recrutaDb = await run('curl -s -o /dev/null -w "%{http_code}" https://recruta.db.flwdesk.com/')
  const recrutaJob = await run(
    'curl -s -o /dev/null -w "%{http_code}" https://recruta.flwdesk.com/vaga/fiscal-de-loja-nc4kq'
  )
  const vagas = await run(
    'curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://vagas.db.flwdesk.com/'
  )
  const api = await run(
    'curl -s -o /dev/null -w "%{http_code}" https://rhinteligente.db.flwdesk.com/rest/v1/ -H "apikey: invalid"'
  )
  console.log(
    'tests: /digaspi',
    digaspi.out.trim(),
    '| rh/',
    root.out.trim(),
    '| recruta/',
    recruta.out.trim(),
    '| recruta.db/',
    recrutaDb.out.trim(),
    '| vaga',
    recrutaJob.out.trim(),
    '| vagas/→',
    vagas.out.trim(),
    '| api/',
    api.out.trim()
  )
}

function done() {
  console.log('DEPLOY SITES OK')
  conn.end()
  process.exit(0)
}
