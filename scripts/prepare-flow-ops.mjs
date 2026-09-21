import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dest = path.join(root, 'supabase', 'functions', 'flow-ops')
const sharedDest = path.join(dest, '_shared')
fs.mkdirSync(sharedDest, { recursive: true })

function rewriteShared(src) {
  return src
    .replaceAll("from './roles'", "from './roles.ts'")
    .replaceAll("from './cpf'", "from './cpf.ts'")
    .replaceAll("from './store-scope'", "from './store-scope.ts'")
    .replaceAll("from './attendance'", "from './attendance.ts'")
    .replaceAll("from './schedules'", "from './schedules.ts'")
    .replaceAll("from './vouchers'", "from './vouchers.ts'")
    .replaceAll("from './sorteio'", "from './sorteio.ts'")
    .replaceAll("from './operations'", "from './operations.ts'")
    .replaceAll("from './kobbi'", "from './kobbi.ts'")
}

function rewriteMain(src) {
  return src
    .replaceAll("import log from 'electron-log'", "import log from './log.ts'")
    .replaceAll("import bcrypt from 'bcryptjs'", "import bcrypt from 'npm:bcryptjs@3.0.3'")
    .replace(/from '\.\.\/shared\/([^']+)'/g, "from './_shared/$1.ts'")
    .replace(/from '\.\/([a-z0-9-]+)'/g, "from './$1.ts'")
}

const sharedFiles = [
  'roles.ts',
  'cpf.ts',
  'store-scope.ts',
  'attendance.ts',
  'schedules.ts',
  'vouchers.ts',
  'sorteio.ts',
  'operations.ts',
  'kobbi.ts'
]
for (const file of sharedFiles) {
  const raw = fs.readFileSync(path.join(root, 'src', 'shared', file), 'utf8')
  fs.writeFileSync(path.join(sharedDest, file), rewriteShared(raw))
}

const mainFiles = [
  'dates.ts',
  'cardplus.ts',
  'identities.ts',
  'access.ts',
  'cards.ts',
  'card-overrides.ts',
  'finance-days.ts',
  'stores.ts',
  'attendance.ts',
  'schedules.ts',
  'vouchers.ts',
  'sorteio.ts',
  'users.ts'
]
for (const file of mainFiles) {
  const raw = fs.readFileSync(path.join(root, 'src', 'main', file), 'utf8')
  fs.writeFileSync(path.join(dest, file), rewriteMain(raw))
}

console.log(`copied ${sharedFiles.length} shared + ${mainFiles.length} main`)
