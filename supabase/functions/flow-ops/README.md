# FLOW ops — Edge Function

Backend único que o app mobile chama. O anon key do FLOW **não** escreve Card+ nem attendance; esta função usa service role no servidor.

## Secrets (Supabase Dashboard → Project Settings → Edge Functions → Secrets)

Defina **exatamente**:

| Secret | Origem |
|---|---|
| `FLOW_SUPABASE_URL` | URL do projeto FLOW (ex.: `https://sirupkygppdladkpzytc.supabase.co`). Se omitir, a função usa `SUPABASE_URL` automático. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role do FLOW. Nunca no app. |
| `CARDPLUS_SUPABASE_URL` | URL do Supabase Card+. |
| `CARDPLUS_SUPABASE_SERVICE_ROLE_KEY` | Service role do Card+. Nunca no app. |
| `OPENAI_API_KEY` | Opcional. Sem ela, `kobbiSend` devolve erro claro. |
| `OPENAI_BASE_URL` | Opcional. Padrão `https://api.openai.com/v1`. |
| `OPENAI_MODEL` | Opcional. Padrão `gpt-4o`. |
| `OPENAI_FALLBACK` | Opcional. Padrão `gpt-4o-mini`. |

Não coloque esses valores no `mobile/.env` nem em `VITE_*`.

## Deploy

```bash
npx supabase login
npx supabase link --project-ref sirupkygppdladkpzytc
npx supabase secrets set FLOW_SUPABASE_URL=https://sirupkygppdladkpzytc.supabase.co
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
npx supabase secrets set CARDPLUS_SUPABASE_URL=...
npx supabase secrets set CARDPLUS_SUPABASE_SERVICE_ROLE_KEY=...
npx supabase secrets set OPENAI_API_KEY=...
npx supabase functions deploy flow-ops --no-verify-jwt
```

`--no-verify-jwt` é necessário porque a função valida o JWT do **usuário** no código (`auth.getUser`) e devolve `{ ok: false }` em vez de um 401 genérico do gateway. O header `Authorization: Bearer <access_token>` continua obrigatório.

URL padrão do mobile: `https://sirupkygppdladkpzytc.supabase.co/functions/v1/flow-ops`

## Contrato

`POST` JSON `{ "op": "getOverview", "payload": { "storeId": "..." } }`

Resposta: `{ "ok": true, "data": ... }` ou `{ "ok": false, "error": "..." }`

## SQL

Rodar no FLOW, nesta ordem se ainda faltar:

1. `0012_flow_attendance.sql` / `0013_flow_attendance_daily_headcount.sql`
2. **`0015_flow_attendance_photos.sql`** — coluna `photos jsonb` default `[]` nos atestados
