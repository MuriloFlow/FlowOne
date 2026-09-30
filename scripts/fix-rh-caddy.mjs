// Fix do bloco /digaspi no Caddy:
//   1. root correto: /usr/share/caddy/rh (montagem de /opt/flow-portal)
//   2. só HTTP puro: o domínio rh.flwdesk.com é proxy Cloudflare (IPs CF),
//      então o Let's Encrypt NÃO consegue emitir cert direto na VPS —
//      o SSL fica na borda do Cloudflare e o Caddy atende :80.
//   3. recria o gateway (bind mount por inode) e testa.
// Uso: node scripts/fix-rh-caddy.mjs
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'ssh2'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envText = readFileSync(resolve(root, '.env.local'), 'utf8')
const env = {}
for (const raw of envText.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const cut = line.indexOf('=')
  env[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
}

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

const PY = String.raw`
import re
path = '/opt/supabase-src/docker/Caddyfile.projects'
text = open(path).read()
new_block = (
    '# Portal Publico do RH (digaspi)\n'
    'http://rh.flwdesk.com/digaspi/*, https://rh.flwdesk.com/digaspi/* {\n'
    '\timport secure_headers\n'
    '\tencode gzip\n'
    '\troot * /usr/share/caddy/rh\n'
    '\ttry_files {path} /digaspi/index.html\n'
    '\tfile_server\n'
    '}\n'
)
pattern = r'# Portal Publico do RH \(digaspi\)[^\n]*\nhttp://rh\.flwdesk\.com/digaspi/\*[^\n]*\{.*?\n\}'
text, n = re.subn(pattern, new_block.rstrip('\n'), text, count=1, flags=re.S)
print('blocos substituidos:', n)
open(path, 'w').write(text)
print('OK')
`

const conn = new Client()
conn
  .on('ready', async () => {
    console.log('1) Corrigindo bloco /digaspi...')
    const pyB64 = Buffer.from(PY, 'utf8').toString('base64')
    const patch = await run(conn, `echo '${pyB64}' | base64 -d > /tmp/fix_digaspi.py && python3 /tmp/fix_digaspi.py`)
    console.log('  ', patch.out.trim().split('\n').join(' | '))

    console.log('2) Validando config...')
    const validate = await run(
      conn,
      `cd /opt/supabase-src/docker && docker compose -f docker-compose.yml -f docker-compose.projects.yml up -d --no-deps --force-recreate project-gw 2>&1 | tail -1 && sleep 6 && docker exec project-gw caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | grep -Eo 'Valid configuration|Error.*' | head -1`
    )
    console.log('  ', validate.out.trim().split('\n').join(' | '))
    if (!/Valid configuration/.test(validate.out)) {
      console.error('>>> config inválida, abortando')
      process.exit(1)
    }

    console.log('3) Testes locais (Host header direto no gateway)...')
    const tests = await run(
      conn,
      `curl -s -H 'Host: rh.flwdesk.com' http://127.0.0.1/digaspi/ -o /dev/null -w 'digaspi/: %{http_code}\\n' --max-time 8; curl -s -H 'Host: rh.flwdesk.com' http://127.0.0.1/digaspi/vaga/x -o /dev/null -w 'SPA: %{http_code}\\n' --max-time 8; curl -s -H 'Host: rh.db.flwdesk.com' http://127.0.0.1/ -o /dev/null -w 'rh.db: %{http_code}\\n' --max-time 8`
    )
    console.log(tests.out.trim())
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
