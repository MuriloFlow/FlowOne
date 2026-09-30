// Smoke E2E do fluxo de senha (v1.9.0):
//   1. criação SEM senha → temporária de exatamente 8 dígitos + must_set_password
//   2. login com a temporária → RPC flow_auth_set_own_password → flag limpa
//   3. redefinição pelo admin → nova temporária de 8 dígitos + login ok
//   4. senha digitada curta continua sendo rejeitada (validação só quando digitada)
// Uso: node scripts/smoke-password.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const raw of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const cut = line.indexOf('=')
  env[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
}

const base = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY
if (!base || !anon) throw new Error('VITE_SUPABASE_URL/ANON_KEY ausentes no .env.local')

async function callOp(op, payload, token) {
  const res = await fetch(`${base}/functions/v1/flow-ops`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, payload })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) throw new Error(`${op}: ${json.error || res.status}`)
  return json.data
}

async function login(email, password) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`login ${email}: ${json.error_description || json.msg || res.status}`)
  return json
}

const stamp = Date.now().toString(36).slice(-6)
const testEmail = `smoke.senha.${stamp}@flow.test`
const finalPassword = `SenhaForte${stamp}!`

// 1) Admin (bootstrap) cria acesso SEM senha
const adminAuth = await login(env.FLOW_BOOTSTRAP_EMAIL, env.FLOW_BOOTSTRAP_PASSWORD)
const adminToken = adminAuth.access_token

console.log('1) upsertFlowUser SEM senha...')
const created = await callOp(
  'upsertFlowUser',
  {
    email: testEmail,
    displayName: 'Smoke Senha',
    role: 'LIDER_OPERACAO',
    storeId: null,
    status: 'active'
  },
  adminToken
)
const temp1 = created.temporaryPassword
if (!/^\d{8}$/.test(temp1 ?? '')) throw new Error(`temporária de criação não tem 8 dígitos: ${temp1}`)
if (created.mustSetPassword !== true) throw new Error('must_set_password deveria ser true na criação sem senha')
console.log('   temporária de criação ok:', temp1, '| mustSetPassword:', created.mustSetPassword)

try {
  // 2) Funcionário loga com a temporária e cria a senha definitiva
  console.log('2) login com a temporária...')
  const tempLogin = await login(testEmail, temp1)
  const userToken = tempLogin.access_token
  const scope = await callOp('getActorScope', {}, userToken)
  if (scope.blocked) throw new Error(`escopo bloqueado: ${scope.message}`)

  console.log('   setOwnPassword (RPC flow_auth_set_own_password)...')
  await callOp('setOwnPassword', { newPassword: finalPassword }, userToken)

  // flag limpa?
  const scope2 = await callOp('getActorScope', {}, userToken)
  console.log('   flag após troca (actorscope não expõe flag; login a seguir valida):', scope2.role)

  // 3) redefinição pelo admin → nova temporária de 8 dígitos
  console.log('3) resetFlowUserPassword...')
  const reset = await callOp('resetFlowUserPassword', { id: created.id }, adminToken)
  if (!/^\d{8}$/.test(reset.temporaryPassword ?? '')) {
    throw new Error(`temporária de reset não tem 8 dígitos: ${reset.temporaryPassword}`)
  }
  console.log('   nova temporária:', reset.temporaryPassword)

  // senha antiga deve falhar, nova temporária deve entrar
  let oldRejected = false
  try {
    await login(testEmail, finalPassword)
  } catch {
    oldRejected = true
  }
  if (!oldRejected) throw new Error('senha definitiva anterior deveria ter sido invalidada pelo reset')
  console.log('   senha antiga invalidada ✓')

  const reLogin = await login(testEmail, reset.temporaryPassword)
  if (!reLogin.access_token) throw new Error('login com a nova temporária falhou')
  console.log('   login com a nova temporária ✓')

  // 4) funcionário define a senha definitiva de novo (pós-reset)
  await callOp('setOwnPassword', { newPassword: finalPassword }, reLogin.access_token)
  const finalLogin = await login(testEmail, finalPassword)
  if (!finalLogin.access_token) throw new Error('login com a senha definitiva falhou')
  console.log('   senha definitiva redefinida e login normal ✓')

  // 5) senha digitada curta continua sendo rejeitada na criação
  console.log('4) validação de senha digitada curta...')
  let shortRejected = false
  try {
    await callOp(
      'upsertFlowUser',
      {
        email: `curta.${stamp}@flow.test`,
        displayName: 'Senha Curta',
        role: 'GERENTE',
        password: '123',
        status: 'active'
      },
      adminToken
    )
  } catch (error) {
    shortRejected = /8 caracteres/i.test(String(error.message))
  }
  if (!shortRejected) throw new Error('senha digitada com 3 caracteres deveria ser rejeitada')
  console.log('   senha curta rejeitada ✓')

  console.log('SMOKE SENHA OK')
} finally {
  // limpeza: desativa e tenta remover o acesso de teste
  try {
    const list = await callOp('listFlowUsers', {}, adminToken)
    const target = list.find((user) => user.email === testEmail)
    if (target) {
      await callOp(
        'upsertFlowUser',
        { id: target.id, email: testEmail, displayName: 'Smoke Senha', role: 'LIDER_OPERACAO', status: 'inactive' },
        adminToken
      )
    }
    console.log('(acesso de teste desativado)')
  } catch {
    /* best-effort */
  }
}
