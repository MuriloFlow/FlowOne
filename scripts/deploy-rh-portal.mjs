// Deploy do Portal Público do RH (rh.flwdesk.com/digaspi):
//   1. Build do portal React (public-portal) com as chaves públicas injetadas
//   2. Envia public-portal/dist/* → /opt/flow-portal/rh/digaspi (base64, byte a byte)
//   3. Garante o alias rh.flwdesk.com no Caddy (idempotente)
//   4. Valida a config, recria project-gw (bind mount por inode) e testa HTTPS
// Uso: node scripts/deploy-rh-portal.mjs
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve as resolvePath, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'ssh2'

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const raw of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const cut = line.indexOf('=')
  env[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
}

const PORTAL_DIR = join(root, 'public-portal')
const DIST = join(PORTAL_DIR, 'dist')
const REMOTE_BASE = '/opt/flow-portal/rh'
const REMOTE_DIR = REMOTE_BASE + '/digaspi'

// 0) Build com as chaves públicas (anon key é pública por design; RLS limita).
console.log('0) Build do portal React...')
execSync('npm run build', {
  cwd: PORTAL_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY
  }
})

function run(conn, cmd, input = null) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      stream.on('close', (code) => resolve({ out, code: code ?? 0 }))
      stream.on('data', (d) => (out += d.toString()))
      stream.stderr.on('data', (d) => (out += d.toString()))
      if (input !== null) stream.end(input)
    })
  })
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}

const PY = String.raw`
import re
path = '/opt/supabase-src/docker/Caddyfile.projects'
text = open(path).read()
changed = False
# 1) server_alias rh.flwdesk.com no bloco existente do rh.db
if 'server_alias rh.flwdesk.com' not in text:
    new_text, n = re.subn(
        r'(http://rh\.db\.flwdesk\.com, https://rh\.db\.flwdesk\.com) \{',
        r'\1 {\n\tserver_alias rh.flwdesk.com',
        text, count=1)
    if n:
        text = new_text
        changed = True
        print('alias rh.flwdesk.com adicionado ao bloco rh.db')
# 2) bloco /digaspi (placeholders escapados para não conflitar com o formato do Caddy)
if '/digaspi/' not in text:
    block = (
        '\n# Portal Publico do RH (digaspi)\n'
        'http://rh.flwdesk.com/digaspi/*, https://rh.flwdesk.com/digaspi/* {\n'
        '\timport secure_headers\n'
        '\tencode gzip\n'
        '\troot * /opt/flow-portal/rh\n'
        '\ttry_files {path} /digaspi/index.html\n'
        '\tfile_server\n'
        '}\n')
    text = text.rstrip() + block
    changed = True
    print('bloco /digaspi adicionado')
if changed:
    open(path, 'w').write(text)
    print('CADDY UPDATED')
else:
    print('CADDY ALREADY OK')
`

const conn = new Client()
conn
  .on('ready', async () => {
    console.log('1) Preparando diretorios remotos...')
    await run(conn, `mkdir -p ${REMOTE_DIR} && mkdir -p ${REMOTE_BASE} && rm -rf ${REMOTE_DIR}/*`)

    const files = [...walk(DIST)]
    console.log(`   ${files.length} arquivo(s) para enviar`)
    let i = 0
    for (const file of files) {
      const rel = relative(DIST, file).split('\\').join('/')
      const raw = readFileSync(file)
      const b64 = Buffer.from(raw).toString('base64')
      const chunks = b64.match(/.{1,60000}/gs) ?? []
      const remote = `${REMOTE_DIR}/${rel}`
      await run(conn, `mkdir -p "${remote.slice(0, remote.lastIndexOf('/'))}"`)
      await run(conn, `rm -f "${remote}"`)
      for (const chunk of chunks) {
        const r = await run(conn, `printf '%s' '${chunk}' >> "${remote}.b64"`)
        if (r.code !== 0) throw new Error(`chunk falhou: ${rel}`)
      }
      const dec = await run(conn, `base64 -d "${remote}.b64" > "${remote}" && rm "${remote}.b64"`)
      if (dec.code !== 0) throw new Error(`decode falhou: ${rel}`)
      i++
    }
    console.log('   upload completo')

    console.log('2) Atualizando Caddyfile.projects...')
    const pyB64 = Buffer.from(PY, 'utf8').toString('base64')
    const patch = await run(conn, `echo '${pyB64}' | base64 -d > /tmp/rh_portal_patch.py && python3 /tmp/rh_portal_patch.py`)
    console.log('  ', patch.out.trim().split('\n').join(' | '))
    if (!/CADDY (UPDATED|ALREADY OK)/.test(patch.out)) throw new Error('patch do Caddy falhou')

    console.log('3) Validando config...')
    const validate = await run(
      conn,
      `docker exec project-gw caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | grep -Eo 'Valid configuration|ERROR' | head -1`
    )
    console.log('  ', validate.out.trim())
    if (!/Valid configuration/.test(validate.out)) {
      console.error('>>> config invalida, abortando (backups em Caddyfile.projects.bak.*)')
      process.exit(1)
    }

    console.log('4) Recriando gateway...')
    const up = await run(
      conn,
      `cd /opt/supabase-src/docker && docker compose -f docker-compose.yml -f docker-compose.projects.yml up -d --no-deps --force-recreate project-gw 2>&1 | tail -2`
    )
    console.log('  ', up.out.trim().split('\n').join(' | '))
    await run(conn, 'sleep 6')

    console.log('5) Testes publicos...')
    for (const [label, url] of [
      ['digaspi /', 'https://rh.flwdesk.com/digaspi/'],
      ['digaspi SPA', 'https://rh.flwdesk.com/digaspi/vaga/x'],
      ['digaspi asset', 'https://rh.flwdesk.com/digaspi/manifest.webmanifest']
    ]) {
      const t = await run(conn, `curl -sk -o /dev/null -w '%{http_code}' '${url}' --max-time 15`)
      console.log('  ', label, '->', t.out)
    }
    const idx = await run(conn, `curl -sk https://rh.flwdesk.com/digaspi/ | head -c 120`)
    console.log('   conteudo:', idx.out.slice(0, 100))
    const others = await run(
      conn,
      `curl -sk -o /dev/null -w '%{http_code}' https://rh.db.flwdesk.com/ && curl -sk -o /dev/null -w ' %{http_code}' https://flowone.db.flwdesk.com/rest/v1/ -H 'apikey: x'`
    )
    console.log('   rh.db + flowone intactos ->', others.out, '(esperado 200 e 401)')
    conn.end()
  })
  .on('error', (err) => {
    console.error('SSH ERRO:', err.message)
    process.exit(1)
  })
  .connect({
    host: env.FLOW_VPS_HOST,
    port: Number(env.FLOW_VPS_PORT || 22),
    username: env.FLOW_VPS_USER || 'root',
    password: env.FLOW_VPS_PASSWORD,
    readyTimeout: 20000
  })
