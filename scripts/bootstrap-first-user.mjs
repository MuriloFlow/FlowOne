import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  const file = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  const env = {}

  for (const line of file.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
  }

  return env
}

const env = loadEnvLocal()
const url = env.VITE_SUPABASE_URL
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY
const email = env.FLOW_BOOTSTRAP_EMAIL
const password = env.FLOW_BOOTSTRAP_PASSWORD

if (!url || !serviceRole || !email || !password) {
  console.error('Missing bootstrap env. Check .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const { data: existing, error: listError } = await supabase.auth.admin.listUsers()
if (listError) {
  console.error('Failed to list users:', listError.message)
  process.exit(1)
}

const already = existing.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())

if (already) {
  const { error } = await supabase.auth.admin.updateUserById(already.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...already.user_metadata,
      full_name: already.user_metadata?.full_name ?? 'Murilo',
      role: 'SUPERVISOR'
    }
  })

  if (error) {
    console.error('Failed to update first user:', error.message)
    process.exit(1)
  }

  const { error: profileError } = await supabase.from('flow_profiles').upsert({
    user_id: already.id,
    email,
    display_name: already.user_metadata?.full_name ?? 'Murilo',
    role: 'SUPERVISOR',
    status: 'active'
  })

  if (profileError) {
    console.warn('Profile role update skipped:', profileError.message)
  }

  console.log('First access user already existed and was refreshed:', email)
  process.exit(0)
}

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    full_name: 'Murilo',
    role: 'SUPERVISOR'
  }
})

if (error) {
  console.error('Failed to create first user:', error.message)
  process.exit(1)
}

console.log('First access user created:', data.user?.email)
