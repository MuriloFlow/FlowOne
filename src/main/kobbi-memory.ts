import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import log from 'electron-log'
import { KOBBI_THREAD_LIMIT, type KobbiRatingValue, type KobbiThread } from '../shared/kobbi'
import { getFlowAdminClient } from './supabase-clients'

type LocalCache = {
  threads: Record<string, KobbiThread[]>
  ratings: Array<{
    userId: string
    rating: KobbiRatingValue
    excerpt: string
    createdAt: string
  }>
}

type ThreadRow = {
  id: string
  title: string
  messages: unknown
  created_at: string
  updated_at: string | null
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_kobbi_/i.test(error.message ?? '')
  )
}

function cachePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'kobbi-memory.json')
}

function readCache(): LocalCache {
  try {
    if (!existsSync(cachePath())) return { threads: {}, ratings: [] }
    const raw = JSON.parse(readFileSync(cachePath(), 'utf8')) as LocalCache
    return {
      threads: raw.threads && typeof raw.threads === 'object' ? raw.threads : {},
      ratings: Array.isArray(raw.ratings) ? raw.ratings.slice(-40) : []
    }
  } catch {
    return { threads: {}, ratings: [] }
  }
}

function writeCache(cache: LocalCache): void {
  writeFileSync(cachePath(), JSON.stringify(cache), 'utf8')
}

function pruneThreads(list: KobbiThread[]): KobbiThread[] {
  return [...list]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, KOBBI_THREAD_LIMIT)
}

function asMessages(value: unknown): KobbiThread['messages'] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      if ((row.role !== 'user' && row.role !== 'assistant') || typeof row.content !== 'string') return null
      return { role: row.role, content: row.content.slice(0, 8000) }
    })
    .filter((item): item is KobbiThread['messages'][number] => Boolean(item))
    .slice(0, 80)
}

function toThread(row: ThreadRow): KobbiThread {
  return {
    id: row.id,
    title: row.title,
    messages: asMessages(row.messages),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at
  }
}

export function hashKobbiMessage(content: string): string {
  return createHash('sha256').update(content.slice(0, 4000)).digest('hex').slice(0, 32)
}

function sanitizeExcerpt(content: string): string {
  return content
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b\d{11}\b/g, '[doc]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export async function listKobbiThreads(userId: string): Promise<KobbiThread[]> {
  const cache = readCache()
  const local = pruneThreads(cache.threads[userId] ?? [])

  try {
    const { data, error } = await getFlowAdminClient()
      .from('flow_kobbi_threads')
      .select('id, title, messages, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(KOBBI_THREAD_LIMIT)

    if (error) {
      if (isMissingTable(error)) return local
      throw new Error(`Erro ao carregar o histórico do Kobbi: ${error.message}`)
    }

    const rows = ((data ?? []) as ThreadRow[]).map(toThread)
    if (rows.length === 0 && local.length > 0) {
      await migrateLocalThreads(userId, local)
      return local
    }

    cache.threads[userId] = rows
    writeCache(cache)
    return rows
  } catch (error) {
    if (error instanceof Error && /histórico do Kobbi/i.test(error.message)) throw error
    log.warn('[kobbi-memory] list fallback', error instanceof Error ? error.message : error)
    return local
  }
}

async function migrateLocalThreads(userId: string, threads: KobbiThread[]): Promise<void> {
  const client = getFlowAdminClient()
  for (const thread of threads) {
    const { error } = await client.from('flow_kobbi_threads').upsert(
      {
        id: thread.id,
        user_id: userId,
        title: thread.title.slice(0, 80),
        messages: thread.messages,
        created_at: thread.createdAt,
        updated_at: thread.updatedAt
      },
      { onConflict: 'id' }
    )
    if (error) {
      log.warn('[kobbi-memory] migrate', error.message)
      return
    }
  }
}

export async function saveKobbiThread(
  userId: string,
  input: { id?: string; title: string; messages: KobbiThread['messages'] }
): Promise<KobbiThread> {
  const cache = readCache()
  const current = cache.threads[userId] ?? []
  const id = input.id && input.id.length >= 8 ? input.id : randomUUID()
  const now = new Date().toISOString()
  const existing = current.find((item) => item.id === id)
  const thread: KobbiThread = {
    id,
    title: input.title.trim().replace(/\s+/g, ' ').slice(0, 72) || 'Conversa',
    messages: asMessages(input.messages),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  cache.threads[userId] = pruneThreads([thread, ...current.filter((item) => item.id !== id)])
  writeCache(cache)

  const { error } = await getFlowAdminClient().from('flow_kobbi_threads').upsert(
    {
      id: thread.id,
      user_id: userId,
      title: thread.title,
      messages: thread.messages,
      created_at: thread.createdAt,
      updated_at: thread.updatedAt
    },
    { onConflict: 'id' }
  )

  if (error && !isMissingTable(error)) {
    throw new Error(`Erro ao salvar o histórico do Kobbi: ${error.message}`)
  }

  if (!error) {
    const { data: extras } = await getFlowAdminClient()
      .from('flow_kobbi_threads')
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    const overflow = ((extras ?? []) as Array<{ id: string }>).slice(KOBBI_THREAD_LIMIT)
    if (overflow.length > 0) {
      await getFlowAdminClient()
        .from('flow_kobbi_threads')
        .delete()
        .in(
          'id',
          overflow.map((row) => row.id)
        )
    }
  }

  return thread
}

export async function saveKobbiRating(
  userId: string,
  input: { threadId?: string | null; content: string; rating: KobbiRatingValue }
): Promise<void> {
  const excerpt = sanitizeExcerpt(input.content)
  const row = {
    user_id: userId,
    thread_id: input.threadId && input.threadId.length >= 8 ? input.threadId : null,
    message_hash: hashKobbiMessage(input.content),
    excerpt,
    rating: input.rating
  }

  const cache = readCache()
  cache.ratings = [
    ...cache.ratings.filter(
      (item) => !(item.userId === userId && item.excerpt === excerpt)
    ),
    { userId, rating: input.rating, excerpt, createdAt: new Date().toISOString() }
  ].slice(-40)
  writeCache(cache)

  const { error } = await getFlowAdminClient().from('flow_kobbi_ratings').insert(row)
  if (error && !isMissingTable(error)) {
    throw new Error(`Erro ao salvar a avaliação: ${error.message}`)
  }
}

export async function listKobbiRatingHints(userId: string): Promise<string> {
  const fallback = readCache().ratings.filter((item) => item.userId === userId).slice(-8)
  let good = fallback.filter((item) => item.rating === 'good').length
  let bad = fallback.filter((item) => item.rating === 'bad').length
  let notes = fallback
    .filter((item) => item.rating === 'bad')
    .slice(-3)
    .map((item) => item.excerpt)
    .filter(Boolean)

  try {
    const { data, error } = await getFlowAdminClient()
      .from('flow_kobbi_ratings')
      .select('rating, excerpt, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8)

    if (!error && data) {
      const rows = data as Array<{ rating: KobbiRatingValue; excerpt: string | null }>
      good = rows.filter((item) => item.rating === 'good').length
      bad = rows.filter((item) => item.rating === 'bad').length
      notes = rows
        .filter((item) => item.rating === 'bad')
        .slice(0, 3)
        .map((item) => sanitizeExcerpt(item.excerpt ?? ''))
        .filter(Boolean)
    }
  } catch (error) {
    log.warn('[kobbi-memory] ratings hint', error instanceof Error ? error.message : error)
  }

  if (good + bad === 0) return ''
  const parts = [
    `O gestor avaliou recentemente ${good} resposta${good === 1 ? '' : 's'} como boa e ${bad} como ruim.`
  ]
  if (bad > 0) {
    parts.push(
      'Nas avaliações ruins, seja mais numérico, cite unidade e data, e nunca diga que um KPI "não está neste recorte" se o campo existir no JSON — null significa não lançado.'
    )
    if (notes.length > 0) {
      parts.push(`Notas curtas das ruins: ${notes.join(' | ')}`)
    }
  }
  return parts.join(' ')
}
