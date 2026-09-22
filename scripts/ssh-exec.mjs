// Publica a função flow-ops no servidor FLOW self-hosted.
//
// Cada arquivo é enviado via base64 por STDIN (`docker exec -i`), então nenhum
// caractere ($, crase, aspas) é interpretado pelo shell — o conteúdo na VPS fica
// byte a byte idêntico ao do repositório. Depois de sincronizar, o container de
// edge functions é reiniciado e um smoke test roda contra a URL pública.
//
// Credenciais: FLOW_VPS_* no .env.local (nunca no repositório).
// Uso: node scripts/ssh-exec.mjs [--skip-smoke]
import { Client } from 'ssh2'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localDir = path.join(root, 'supabase', 'functions', 'flow-ops')
// O bind mount é HOST:/opt/supabase-src/docker/volumes/functions ->
// CONTAINER:/home/deno/functions. Escrever via docker exec só funciona no
// caminho de DENTRO do container (/home/deno/...); /opt/... ali dentro é a
// camada descartável do container e nunca chega no runtime.
const remoteDir = '/home/deno/functions/flow-ops'
const container = 'supabase-edge-functions'
const skipSmoke = process.argv.includes('--skip-smoke')

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

const files = []
;(function walk(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) walk(path.join(dir, entry.name), relative)
    else files.push(relative)
  }
})(localDir)

function collectRemote(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      let code = 0
      stream
        .on('close', (exitCode) => {
          code = exitCode ?? 0
          resolve({ out, code })
        })
        .on('data', (data) => {
          out += data.toString()
        })
        .stderr.on('data', (data) => process.stderr.write(data))
    })
  })
}

function runStream(cmd, input) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let code = 0
      stream.on('close', (exitCode) => {
        code = exitCode ?? 0
        resolve(code)
      })
      stream.on('data', () => {})
      stream.stderr.on('data', (data) => process.stderr.write(data))
      stream.end(input)
    })
  })
}

const conn = new Client()

conn
  .on('ready', async () => {
    try {
      console.log(`Sincronizando ${files.length} arquivos de flow-ops para ${host}...`)

      // 0. Limpa resíduo de uploads antigos na camada descartável do container.
      await collectRemote(`docker exec ${container} sh -c 'rm -rf /opt/supabase-src/docker/volumes/functions/flow-ops 2>/dev/null; true'`)

      // 1. Diretórios remotos para subpaths (_shared etc.)
      const dirs = [...new Set(files.map((file) => path.posix.dirname(file)))].filter((d) => d !== '.')
      const mkdirCmd = `docker exec ${container} sh -c 'mkdir -p ${dirs.map((d) => `${remoteDir}/${d}`).join(' ')}'`
      const mkdir = await collectRemote(mkdirCmd)
      if (mkdir.code !== 0) throw new Error(`mkdir remoto falhou (${mkdir.code})`)

      // 2. Upload byte a byte via base64 por STDIN (sem interpretação de shell).
      const localHashes = {}
      for (const file of files) {
        const content = fs.readFileSync(path.join(localDir, file))
        localHashes[file] = createHash('md5').update(content).digest('hex')
        const b64 = content.toString('base64')
        const code = await runStream(
          `docker exec -i ${container} sh -c 'base64 -d > "${remoteDir}/${file}"'`,
          b64
        )
        if (code !== 0) throw new Error(`upload falhou para ${file} (${code})`)
        process.stdout.write(`  ok ${file}\n`)
      }

      // 3. Confere hashes remotamente (normaliza CRLF como o Deno entrega os fontes).
      const hashScript = `docker exec ${container} sh -c 'cd ${remoteDir} && for f in ${files
        .map((f) => `'${f}'`)
        .join(' ')}; do echo "$f|$(tr -d "\\r" < "$f" | md5sum | cut -d" " -f1)"; done'`
      const hashes = await collectRemote(hashScript)
      let mismatches = 0
      for (const line of hashes.out.split('\n')) {
        const [name, hash] = line.trim().split('|')
        if (!name || !hash) continue
        const localNorm = createHash('md5')
          .update(fs.readFileSync(path.join(localDir, name), 'utf8').replace(/\r\n/g, '\n'))
          .digest('hex')
        if (localNorm !== hash) {
          mismatches += 1
          console.error(`  DIFERENTE após upload: ${name}`)
        }
      }
      if (mismatches > 0) throw new Error(`${mismatches} arquivo(s) divergentes após o upload`)

      // 4. Reinicia o runtime para forçar isolates novos.
      const restart = await collectRemote(`docker restart ${container}`)
      if (restart.code !== 0) throw new Error(`restart falhou (${restart.code})`)
      console.log('Container reiniciado. Aguardando ficar saudável...')
      let healthy = false
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const status = await collectRemote(
          `docker inspect --format '{{.State.Health.Status}}' ${container}`
        )
        if (status.out.trim() === 'healthy') {
          healthy = true
          break
        }
      }
      if (!healthy) console.warn('Aviso: saúde do container não confirmada em 60s; seguindo.')

      console.log('flow-ops publicado.')

      if (!skipSmoke) {
        // 5. Smoke test de ponta a ponta contra a URL pública.
        const base = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
        const authRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: env.FLOW_BOOTSTRAP_EMAIL,
            password: env.FLOW_BOOTSTRAP_PASSWORD
          })
        })
        const auth = await authRes.json().catch(() => ({}))
        if (!auth.access_token) throw new Error(`Login do smoke test falhou (${authRes.status}).`)

        async function callOp(op, payload) {
          const res = await fetch(`${base}/functions/v1/flow-ops`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${auth.access_token}`,
              apikey: env.VITE_SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({ op, payload })
          })
          const json = await res.json().catch(() => ({}))
          return { status: res.status, ok: json.ok === true, error: json.error ?? '' }
        }

        const scope = await callOp('getActorScope', {})
        console.log(`smoke getActorScope -> HTTP ${scope.status} ok=${scope.ok} ${scope.error}`)
        const stores = await callOp('listStores', {})
        console.log(`smoke listStores    -> HTTP ${stores.status} ok=${stores.ok} ${stores.error}`)
        const overview = await callOp('getOverview', { storeId: null })
        console.log(`smoke getOverview   -> HTTP ${overview.status} ok=${overview.ok} ${overview.error}`)
        if (!scope.ok || !stores.ok || !overview.ok) {
          throw new Error('Smoke test falhou: flow-ops não está saudável.')
        }
        console.log('Smoke test OK: o fluxo do app mobile deve funcionar.')
      }

      conn.end()
      process.exit(0)
    } catch (error) {
      console.error('Falha na publicação:', error instanceof Error ? error.message : error)
      conn.end()
      process.exit(1)
    }
  })
  .on('error', (error) => {
    console.error('SSH erro:', error.message)
    process.exit(1)
  })
  .connect({ host, port, username: user, password, readyTimeout: 20_000 })
