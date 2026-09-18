import { applyOverviewCardOverlay } from './card-overrides.ts'
import { getCardsBoard } from './cards.ts'
import { getOverview } from './cardplus.ts'
import { getFinanceBoard } from './finance-days.ts'
import { getKobbiScheduleContext } from './schedules.ts'
import { resolveActor, resolveStoreFilter } from './scope.ts'
import { listVoucherBoard } from './vouchers.ts'
import { KOBBI_RH_RULE } from './_shared/kobbi.ts'
import { roleLabel } from './_shared/roles.ts'

type KobbiPayload = {
  storeId?: string | null
  messages?: Array<{ role?: string; content?: string }>
  userName?: string
  userRole?: string
}

function envOr(name: string, fallback: string): string {
  const value = Deno.env.get(name)?.trim()
  return value && value.length > 0 ? value : fallback
}

export async function sendKobbi(payload: unknown): Promise<{ text: string; model: string }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!apiKey) {
    throw new Error('Kobbi está sem OPENAI_API_KEY neste servidor. Configure o secret da função flow-ops.')
  }

  const actor = await resolveActor()
  const body = payload && typeof payload === 'object' ? (payload as KobbiPayload) : {}
  const storeId = resolveStoreFilter(actor, body.storeId ?? body)
  const messages = Array.isArray(body.messages) ? body.messages : []
  const lastUser = [...messages].reverse().find((item) => item.role === 'user' && item.content?.trim())
  if (!lastUser?.content?.trim()) {
    throw new Error('Escreva uma pergunta para o Kobbi.')
  }

  const [overview, finance, cards, schedule, vouchers] = await Promise.all([
    applyOverviewCardOverlay(await getOverview(storeId), storeId),
    getFinanceBoard(storeId),
    storeId ? getCardsBoard(null, storeId) : Promise.resolve(null),
    getKobbiScheduleContext(storeId),
    listVoucherBoard(storeId)
  ])

  const snapshot = {
    usuario: {
      nome: body.userName || actor.displayName,
      cargo: roleLabel(body.userRole || actor.role)
    },
    recorte: {
      unidadeId: storeId,
      unidade: overview.storeName,
      hoje: {
        cartoes: overview.cardsToday,
        vendaCents: overview.saleTodayCents,
        metaCartoes: overview.todayGoal
      },
      mes: {
        cartoes: overview.cardsThisMonth,
        cartoesRegistrados: overview.cardsThisMonthRegistered ?? overview.cardsThisMonth,
        meta: overview.monthGoal,
        ritmoPorDia: overview.pacePerDay,
        aproveitamentoPct: overview.aproveitamentoPct,
        txAprovacaoPct: overview.approvalRatePct,
        clientes: overview.clientesMonth,
        digitacoes: overview.digitacoesMonth,
        vendaCents: finance.salesThisMonthCents,
        metaVendaCents: finance.monthSalesGoalCents,
        puMedia: finance.puAverage
      },
      financeiroDias: finance.days.slice(0, 31).map((day) => ({
        data: day.dateKey,
        vendaCents: day.saleCents,
        metaCents: day.goalCents,
        lastYearCents: day.lastYearCents,
        pu: day.pu
      })),
      cartoesRecentes: (cards?.records ?? overview.recentCards).slice(0, 40).map((card) => ({
        cliente: 'clientName' in card ? card.clientName : card.clientName,
        operador: 'operatorName' in card ? card.operatorName : card.operatorName,
        limiteCents: 'amountInCents' in card ? card.amountInCents : card.amountInCents,
        gastoCents: 'amountUsedInCents' in card ? card.amountUsedInCents : card.amountUsedInCents,
        status: 'activated' in card ? (card.activated ? 'ativado' : 'pendente') : null
      })),
      escala: schedule,
      vales: {
        periodo: vouchers.periodKey,
        totalCents: vouchers.grandTotalCents,
        grupos: vouchers.groups.map((group) => ({
          id: group.id,
          pessoas: group.rows.length,
          totalCents: group.rows.reduce((sum, row) => sum + row.dayTotalCents, 0)
        }))
      }
    }
  }

  const system = [
    'Você é o Kobbi, copiloto operacional do FLOW. Responda em português do Brasil, curto e preciso.',
    'Use somente o JSON de recorte. null = não lançado. Não invente tabela, meta ou número.',
    KOBBI_RH_RULE,
    'PU = produto único / mix de peças no caixa, lançado no Financeiro FLOW.',
    `Recorte JSON:\n${JSON.stringify(snapshot)}`
  ].join('\n\n')

  const history = messages
    .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content?.trim())
    .slice(-8)
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content)
    }))

  const model = envOr('OPENAI_MODEL', 'gpt-4o')
  const fallback = envOr('OPENAI_FALLBACK', 'gpt-4o-mini')
  const base = envOr('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, '')

  async function complete(chosen: string): Promise<{ text: string; model: string }> {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: chosen,
        temperature: 0.2,
        messages: [{ role: 'system', content: system }, ...history]
      })
    })
    const json = (await response.json()) as {
      error?: { message?: string }
      choices?: Array<{ message?: { content?: string } }>
    }
    if (!response.ok) {
      throw new Error(json.error?.message || `Kobbi falhou (${response.status}).`)
    }
    const text = json.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('Kobbi não devolveu texto.')
    return { text, model: chosen }
  }

  try {
    return await complete(model)
  } catch (error) {
    if (fallback && fallback !== model) return complete(fallback)
    throw error
  }
}
