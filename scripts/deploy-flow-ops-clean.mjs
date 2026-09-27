// Deploy da edge function flow-ops para o VPS Supabase self-hosted.
// Envia o tar.gz da pasta supabase/functions/flow-ops e reinicia o container
// das edge functions. Uso: node scripts/deploy-flow-ops-clean.mjs
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tgzPath = path.join(root, '.freebuff', 'flow-ops.tgz')

fs.mkdirSync(path.dirname(tgzPath), { recursive: true })
execSync('tar -C supabase/functions -czf .freebuff/flow-ops.tgz flow-ops', { cwd: root, stdio: 'inherit' })

const b64 = fs.readFileSync(tgzPath).toString('base64')
const script = [
  'set -e',
  `echo '${b64}' | base64 -d > /tmp/flow-ops.tgz`,
  'rm -rf /tmp/flow-ops && mkdir -p /tmp/flow-ops',
  'tar -xzf /tmp/flow-ops.tgz -C /tmp/flow-ops',
  'cp -r /tmp/flow-ops/flow-ops /opt/supabase-src/docker/volumes/functions/',
  'docker exec -i supabase-db psql -U postgres -d flowone -c "select 1" >/dev/null && echo "db ok"',
  'docker restart supabase-edge-functions >/dev/null',
  'echo "edge redeploy ok"'
].join('\n')

fs.writeFileSync(path.join(root, '.freebuff', 'deploy-stdin.sh'), script)
execSync('node scripts/vps-run.mjs - < .freebuff/deploy-stdin.sh', { cwd: root, stdio: 'inherit' })
