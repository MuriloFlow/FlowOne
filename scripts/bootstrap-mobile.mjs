import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const mobile = path.join(root, 'mobile')
const sharedDest = path.join(mobile, 'src', 'shared')
const assetsDest = path.join(mobile, 'src', 'assets')
const resourcesDest = path.join(mobile, 'resources')

for (const dir of [sharedDest, assetsDest, resourcesDest, path.join(mobile, 'src', 'lib'), path.join(mobile, 'src', 'pages'), path.join(mobile, 'src', 'components'), path.join(mobile, 'src', 'hooks')]) {
  fs.mkdirSync(dir, { recursive: true })
}

const sharedFiles = ['roles.ts', 'cpf.ts', 'store-scope.ts', 'attendance.ts', 'schedules.ts', 'vouchers.ts', 'operations.ts', 'kobbi.ts']
for (const file of sharedFiles) {
  fs.copyFileSync(path.join(root, 'src', 'shared', file), path.join(sharedDest, file))
}

const iconSrc = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'c-Users-Administrador-Desktop-FLowpay',
  'assets',
  'flow-app-icon.png'
)
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(assetsDest, 'logo.png'))
  fs.copyFileSync(iconSrc, path.join(resourcesDest, 'icon.png'))
  fs.copyFileSync(iconSrc, path.join(resourcesDest, 'splash.png'))
}

const envLocal = path.join(root, '.env.local')
const envExample = [
  'VITE_SUPABASE_URL=https://sirupkygppdladkpzytc.supabase.co',
  'VITE_SUPABASE_ANON_KEY=',
  'VITE_FLOW_OPS_URL=https://sirupkygppdladkpzytc.supabase.co/functions/v1/flow-ops',
  ''
].join('\n')
fs.writeFileSync(path.join(mobile, '.env.example'), envExample)

if (fs.existsSync(envLocal)) {
  const lines = fs.readFileSync(envLocal, 'utf8').split(/\r?\n/)
  const picked = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key === 'VITE_SUPABASE_URL' || key === 'VITE_SUPABASE_ANON_KEY') picked[key] = value
  }
  const env = [
    `VITE_SUPABASE_URL=${picked.VITE_SUPABASE_URL || 'https://sirupkygppdladkpzytc.supabase.co'}`,
    `VITE_SUPABASE_ANON_KEY=${picked.VITE_SUPABASE_ANON_KEY || ''}`,
    'VITE_FLOW_OPS_URL=https://sirupkygppdladkpzytc.supabase.co/functions/v1/flow-ops',
    ''
  ].join('\n')
  fs.writeFileSync(path.join(mobile, '.env'), env)
  console.log('wrote mobile/.env with VITE_ only')
} else {
  console.log('no .env.local')
}

console.log('mobile shared + assets ready')
