import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardList,
  ExternalLink,
  MapPin,
  Search,
  SlidersHorizontal
} from 'lucide-react'
import { BoardLayout, SearchBar } from '../components/Layout'
import {
  EMPLOYMENT_LABEL,
  formatSalary,
  searchJobs,
  type BoardJob,
  type Branding
} from '../lib/api'

function readParams(): { query: string; location: string } {
  const params = new URLSearchParams(window.location.search)
  return {
    query: params.get('query') ?? '',
    location: params.get('location') ?? ''
  }
}

export default function SearchPage({
  branding,
  logo
}: {
  branding: Branding
  logo: string | null
}) {
  const initial = useMemo(readParams, [])
  const [query, setQuery] = useState(initial.query)
  const [location, setLocation] = useState(initial.location)
  const [jobs, setJobs] = useState<BoardJob[] | null>(null)
  const [selected, setSelected] = useState<BoardJob | null>(null)
  const [sort, setSort] = useState<'relevantes' | 'recentes'>('relevantes')

  async function run(queryValue: string, locationValue: string): Promise<void> {
    setJobs(null)
    setSelected(null)
    const params = new URLSearchParams()
    if (queryValue.trim()) params.set('query', queryValue.trim())
    if (locationValue.trim()) params.set('location', locationValue.trim())
    window.history.replaceState(null, '', `/search${params.toString() ? `?${params}` : ''}`)
    try {
      setJobs(await searchJobs(queryValue, locationValue, 50, 0))
    } catch {
      setJobs([])
    }
  }

  useEffect(() => {
    void run(initial.query, initial.location)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sorted = useMemo(() => {
    if (!jobs) return []
    if (sort === 'recentes') {
      return [...jobs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }
    return jobs
  }, [jobs, sort])

  return (
    <BoardLayout
      branding={branding}
      logo={logo}
      onHome={() => (window.location.href = '/')}
      searchSlot={
        <SearchBar
          query={query}
          location={location}
          onQuery={setQuery}
          onLocation={setLocation}
          onSubmit={() => void run(query, location)}
        />
      }
    >
      {/* Filtros (linha de chips estilo InfoJobs) */}
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-400">
            <SlidersHorizontal size={13} /> Filtros
          </span>
          {[
            'Modelo de Trabalho',
            'Publicação',
            'Salário',
            'Contrato',
            'Jornada',
            'Senioridade'
          ].map((label) => (
            <span
              key={label}
              className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12.5px] font-medium text-ink-500"
            >
              {label} <span className="text-ink-300">▾</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {/* Contagem + ordenação */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13.5px] text-ink-500">
            {jobs === null ? (
              'Buscando vagas…'
            ) : (
              <>
                <b className="font-semibold text-ink-900">{jobs.length}</b>{' '}
                {jobs.length === 1 ? 'vaga encontrada' : 'vagas encontradas'}
                {location.trim() ? ` em ${location.trim()}` : ''}
                {query.trim() ? ` para “${query.trim()}”` : ''}
              </>
            )}
          </p>
          <div className="flex items-center gap-1">
            {(['relevantes', 'recentes'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSort(option)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium capitalize transition ${
                  sort === option
                    ? 'bg-ink-900 text-ink-50'
                    : 'text-ink-500 hover:bg-surface-2 hover:text-ink-800'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
          {/* ---------- Lista ---------- */}
          <div className="space-y-3">
            {jobs === null ? (
              <>
                <ResultSkeleton />
                <ResultSkeleton />
                <ResultSkeleton />
              </>
            ) : sorted.length === 0 ? (
              <div className="card flex flex-col items-center px-6 py-14 text-center">
                <Search size={26} className="text-ink-300" />
                <p className="mt-3 font-display text-[16px] font-semibold text-ink-800">
                  Nenhuma vaga encontrada
                </p>
                <p className="mt-1 max-w-sm text-[13.5px] text-ink-500">
                  Tente outro cargo ou uma cidade próxima — novas vagas entram todo dia.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setLocation('')
                    void run('', '')
                  }}
                  className="btn-dark mt-5 !py-2 !text-[13px]"
                >
                  Limpar busca
                </button>
              </div>
            ) : (
              sorted.map((job) => (
                <ResultCard
                  key={job.id}
                  job={job}
                  branding={branding}
                  active={selected?.id === job.id}
                  onClick={() => setSelected(job)}
                />
              ))
            )}
          </div>

          {/* ---------- Painel de detalhe ---------- */}
          <div className="hidden lg:block">
            <div className="sticky top-4">
              {selected ? (
                <JobDetail job={selected} branding={branding} />
              ) : (
                <div className="card flex flex-col items-center justify-center px-8 py-16 text-center">
                  <ClipboardList size={28} className="text-ink-200" />
                  <p className="mt-3 font-display text-[15.5px] font-semibold text-ink-700">
                    Selecione uma vaga
                  </p>
                  <p className="mt-1 max-w-xs text-[13px] text-ink-400">
                    Clique em um resultado à esquerda para ver todos os detalhes e se candidatar.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detalhe embaixo no mobile */}
        {selected ? (
          <div className="mt-4 lg:hidden">
            <JobDetail job={selected} branding={branding} />
          </div>
        ) : null}
      </div>
    </BoardLayout>
  )
}

function ResultSkeleton() {
  return (
    <div className="card p-5">
      <div className="skeleton h-5 w-2/3" />
      <div className="skeleton mt-2.5 h-4 w-1/3" />
      <div className="skeleton mt-4 h-3.5 w-1/4" />
      <div className="skeleton mt-4 h-8 w-full" />
    </div>
  )
}

function ResultCard({
  job,
  branding,
  active,
  onClick
}: {
  job: BoardJob
  branding: Branding
  active: boolean
  onClick: () => void
}) {
  const salary = formatSalary(job)
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(job.created_at).getTime()) / 86_400_000)
  )
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      onClick={onClick}
      className={`card cursor-pointer p-5 transition-all hover:shadow-lift ${
        active ? 'ring-2' : ''
      }`}
      style={active ? { ['--tw-ring-color' as string]: branding.primary_color } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[17px] font-semibold leading-snug tracking-[-0.015em] text-ink-950">
          {job.title}
        </h3>
        <span className="shrink-0 text-[12px] text-ink-400">
          {days === 0 ? 'Hoje' : days === 1 ? 'Ontem' : `${days} dias`}
        </span>
      </div>
      <p className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-700">
        <Building2 size={14} className="text-ink-400" />
        {job.company_name ?? 'Empresa credenciada'}
      </p>
      <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13.5px] text-ink-600">
        <MapPin size={14} className="text-ink-400" />
        {job.location ?? job.work_model ?? 'Brasil'}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-500">
        {salary ? (
          <span className="inline-flex items-center gap-1.5">
            <Banknote size={14} className="text-ink-400" /> {salary}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <Briefcase size={14} className="text-ink-400" />
          {EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type}
        </span>
        {job.work_model ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} className="text-ink-400" /> {job.work_model}
          </span>
        ) : null}
      </div>
      {job.description ? (
        <p className="mt-2.5 line-clamp-2 text-[13.5px] leading-relaxed text-ink-500">
          {job.description}
        </p>
      ) : null}
    </motion.article>
  )
}

function JobDetail({ job, branding }: { job: BoardJob; branding: Branding }) {
  const salary = formatSalary(job)
  return (
    <motion.div
      key={job.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="card overflow-hidden"
    >
      <div className="p-6">
        <h2 className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink-950">
          {job.title}
        </h2>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-ink-800">
          <Building2 size={15} className="text-ink-400" />
          {job.company_name ?? 'Empresa credenciada'}
          <span
            className="inline-flex"
            title="Empresa credenciada FLOW"
            style={{ color: branding.primary_color }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l2.4 2.4 3.4-.4.4 3.4L20.6 10l-2.4 2.6.4 3.4-3.4.4L12 18.8 9.6 16.4l-3.4-.4.4-3.4L4.2 10l2.4-2.6-.4-3.4 3.4-.4L12 2zm-1 12.2l5-5-1.4-1.4-3.6 3.6-1.8-1.8L7.8 11l3.2 3.2z" />
            </svg>
          </span>
        </p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-[14px] text-ink-600">
          <MapPin size={15} className="text-ink-400" />
          {job.location ?? '—'}
        </p>
        {salary ? (
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-700">
            <Banknote size={15} className="text-ink-400" /> {salary}
          </p>
        ) : null}
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13.5px] text-ink-500">
          <CalendarClock size={14} className="text-ink-400" /> Publicada{' '}
          {new Date(job.created_at).toLocaleDateString('pt-BR')}
        </p>

        <a
          href={`https://rh.flwdesk.com/digaspi/#/candidatar/${job.slug}`}
          className="btn-brand mt-5 w-full !rounded-xl !py-3 !text-[14.5px] font-bold"
          style={{ backgroundColor: branding.primary_color }}
        >
          CANDIDATAR-ME
        </a>

        {/* Tabs simples: descrição */}
        <div className="mt-6 border-b border-ink-100">
          <span
            className="inline-block border-b-2 pb-2 text-[13px] font-bold uppercase tracking-wide"
            style={{ borderColor: branding.primary_color, color: branding.primary_color }}
          >
            Vaga
          </span>
        </div>
        {job.description ? (
          <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-700">
            {job.description}
          </p>
        ) : null}

        {job.requirements && job.requirements.length > 0 ? (
          <div className="mt-5">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-ink-400">
              Pré-requisitos
            </h4>
            <ul className="mt-2 space-y-1">
              {job.requirements.map((item, index) => (
                <li key={index} className="flex gap-2 text-[13.5px] text-ink-600">
                  <span style={{ color: branding.primary_color }}>•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {job.benefits && job.benefits.length > 0 ? (
          <div className="mt-5">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-ink-400">
              Benefícios
            </h4>
            <ul className="mt-2 space-y-1">
              {job.benefits.map((item, index) => (
                <li key={index} className="flex gap-2 text-[13.5px] text-ink-600">
                  <span style={{ color: branding.primary_color }}>•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <a
          href={`https://rh.flwdesk.com/digaspi/#/vaga/${job.slug}`}
          className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-400 transition-colors hover:text-ink-700"
        >
          <ExternalLink size={13.5} /> Abrir página completa da vaga
        </a>
      </div>
    </motion.div>
  )
}
