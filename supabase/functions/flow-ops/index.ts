import { corsHeaders, jsonResponse } from './cors.ts'
import { dispatchOp, implementedOps } from './operations.ts'
import { authenticateRequest, setCurrentActor } from './scope.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { ok: false, error: 'Use POST JSON { op, payload }.' }, 405)
  }

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) {
    return jsonResponse(req, { ok: false, error: 'Authorization Bearer do usuário é obrigatório.' }, 401)
  }

  try {
    await authenticateRequest(token)
    const body = (await req.json()) as { op?: unknown; payload?: unknown }
    const op = typeof body.op === 'string' ? body.op.trim() : ''
    if (!op) {
      return jsonResponse(req, { ok: false, error: 'Campo op é obrigatório.', ops: implementedOps() }, 400)
    }
    const data = await dispatchOp(op, body.payload)
    return jsonResponse(req, { ok: true, data: data ?? null })
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Não foi possível concluir esta operação.'
    const unauthorized = /sess[aã]o inv[aá]lida|inativa|n[aã]o possui acesso/i.test(message)
    return jsonResponse(req, { ok: false, error: message }, unauthorized ? 401 : 400)
  } finally {
    setCurrentActor(null)
  }
})
