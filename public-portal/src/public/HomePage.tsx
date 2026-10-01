import { motion } from 'framer-motion'
import {
  ArrowRight,
  Briefcase,
  Building2,
  CalendarClock,
  FileText,
  MapPin,
  Search,
  Sparkles,
  Users
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchOpenJobs } from '../lib/api'
import { EMPLOYMENT_TYPE_LABEL } from '../lib/types'
import type { RhJob } from '../lib/types'
import { ErrorState, EmptyState } from '../components/ui/Kit'

// Landing page — clone da referência com identidade FLOW.

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 }
}

export default function HomePage({ navigate }: { navigate: (to: string) => void }) {
  const [jobs, setJobs] = useState<RhJob[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<string>('all')

  useEffect(() => {
    let alive = true
    fetchOpenJobs()
      .then((data) => alive && setJobs(data))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    if (!jobs) return []
    const q = query.trim().toLowerCase()
    return jobs.filter((j) => {
      if (type !== 'all' && j.employment_type !== type) return false
      if (!q) return true
      return (
        j.title.toLowerCase().includes(q) ||
        (j.department ?? '').toLowerCase().includes(q) ||
        (j.location ?? '').toLowerCase().includes(q)
      )
    })
  }, [jobs, query, type])

  const types = useMemo(() => {
    const set = new Set<string>()
    for (const job of jobs ?? []) set.add(job.employment_type)
    return [...set]
  }, [jobs])

  return (
    <div>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div
          className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-brand-100/60 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-14 pt-16 text-center sm:px-6 sm:pb-20 sm:pt-24">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="chip border border-brand-100 bg-brand-50 text-brand-700"
          >
            <Sparkles size={13} />
            Trabalhe conosco · Digaspi Ribeirão Pires
          </motion.div>

          <motion.h1
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="text-balance mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-[-0.03em] text-ink-950 sm:text-5xl md:text-[3.4rem]"
          >
            Encontre o seu próximo{' '}
            <span className="relative whitespace-nowrap text-brand-600">
              grande passo
              <svg
                className="absolute -bottom-1.5 left-0 w-full text-brand-300"
                viewBox="0 0 220 10"
                fill="none"
                aria-hidden
              >
                <motion.path
                  d="M3 7C60 2.5 160 2.5 217 6.5"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
            </span>
          </motion.h1>

          <motion.p
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-ink-500"
          >
            Conheça as oportunidades abertas na Digaspi Ribeirão Pires e candidate-se em poucos minutos.
            Todo candidato recebe retorno do nosso time de RH.
          </motion.p>

          {/* Busca */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 w-full max-w-md"
          >
            <div className="group relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-brand-500"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por cargo, área ou cidade…"
                className="field-input !rounded-full !py-3 !pl-11 !pr-4 !shadow-card"
                aria-label="Buscar vagas"
              />
            </div>
          </motion.div>

          {/* Indicadores */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.55, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[13px] text-ink-500"
          >
            <span className="inline-flex items-center gap-1.5">
              <Briefcase size={15} className="text-brand-500" />
              <b className="font-semibold text-ink-800">{jobs?.length ?? '…'}</b> vagas abertas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={15} className="text-brand-500" /> Resposta em até 5 dias úteis
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText size={15} className="text-brand-500" /> Currículo protegido
            </span>
          </motion.div>
        </div>
      </section>

      {/* ---------- Vagas ---------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink-900">
              Vagas abertas agora
            </h2>
            <p className="mt-0.5 text-[14px] text-ink-500">Atualizadas em tempo real pelo time de RH</p>
          </div>
          <a
            href="https://recruta.flwdesk.com/search"
            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-600 transition-all hover:gap-2.5"
          >
            Ver todas no Recruta+ <ArrowRight size={15} />
          </a>
        </div>

        {/* Filtros rápidos por tipo de contrato */}
        {types.length > 1 ? (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {[{ key: 'all', label: 'Todas' }, ...types.map((t) => ({ key: t, label: EMPLOYMENT_TYPE_LABEL[t] ?? t }))].map(
              (item) => {
                const active = type === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setType(item.key)}
                    className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all ${
                      active
                        ? 'border-transparent bg-brand-600 text-white shadow-brand'
                        : 'border-ink-200 bg-surface text-ink-600 hover:border-brand-300 hover:text-brand-700'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              }
            )}
          </div>
        ) : null}

        {jobs === null && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-6">
                <div className="skeleton h-5 w-3/4" />
                <div className="skeleton mt-3 h-4 w-1/2" />
                <div className="skeleton mt-6 h-9 w-full" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <ErrorState title="Não foi possível carregar as vagas" message={error} onRetry={() => window.location.reload()} />
        )}

        {jobs !== null && !error && (
          <>
            {filtered.length === 0 ? (
              jobs.length === 0 ? (
                <EmptyState
                  icon={<Briefcase size={26} />}
                  title="Nenhuma vaga aberta no momento"
                  description="Todas as oportunidades foram preenchidas por enquanto. Cadastre seu currículo quando uma nova vaga abrir — estamos sempre crescendo."
                />
              ) : (
                <EmptyState
                  icon={<Search size={26} />}
                  title="Nada encontrado"
                  description="Tente buscar por outro termo — cargo, área ou cidade."
                />
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((job, i) => (
                  <JobCard key={job.id} job={job} index={i} navigate={navigate} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------- Faixa confiança ---------- */}
      <section className="border-t border-ink-100 bg-ink-50/40">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-8 text-[13px] text-ink-500 sm:px-6">
          <span className="inline-flex items-center gap-2 font-medium">
            <Users size={16} className="text-ink-400" /> Processo transparente e organizado
          </span>
          <span className="inline-flex items-center gap-2 font-medium">
            <Building2 size={16} className="text-ink-400" /> Digaspi Ribeirão Pires
          </span>
          <span className="inline-flex items-center gap-2 font-medium">
            <Shield size={16} className="text-ink-400" /> Dados tratados com sigilo (LGPD)
          </span>
        </div>
      </section>
    </div>
  )
}

function Shield({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3l7 3v5c0 4.6-3 8.6-7 10-4-1.4-7-5.4-7-10V6l7-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function JobCard({ job, index, navigate }: { job: RhJob; index: number; navigate: (to: string) => void }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.06 * Math.min(index, 6), ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      className="card group relative flex cursor-pointer flex-col p-6 transition-shadow duration-300 hover:shadow-lift"
      onClick={() => navigate(`/vaga/${job.slug}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="chip bg-brand-50 text-brand-700">{EMPLOYMENT_TYPE_LABEL[job.employment_type] ?? job.employment_type}</span>
        <span className="chip chip-brand-soft">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
          </span>
          Aberta
        </span>
      </div>

      <h3 className="mt-3.5 font-display text-[17.5px] font-semibold leading-snug tracking-[-0.015em] text-ink-900 transition-colors group-hover:text-brand-700">
        {job.title}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ink-500">
        {job.department && (
          <span className="inline-flex items-center gap-1">
            <Building2 size={13.5} /> {job.department}
          </span>
        )}
        {(job.location || job.work_model) && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={13.5} /> {job.location ?? job.work_model}
          </span>
        )}
      </div>

      {job.description && <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-500">{job.description}</p>}

      <div className="mt-auto flex items-center justify-between pt-5">
        <span className="text-[13px] font-medium text-ink-400">
          {job.openings > 1 ? `${job.openings} posições` : '1 posição'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-600 transition-all group-hover:gap-2.5">
          Ver vaga <ArrowRight size={15} />
        </span>
      </div>
    </motion.article>
  )
}
