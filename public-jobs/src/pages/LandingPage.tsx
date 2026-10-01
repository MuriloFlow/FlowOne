import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  Clock,
  MapPin,
  Shield,
  Sparkles,
  Wallet
} from 'lucide-react'
import { BoardLayout, SearchBar } from '../components/Layout'
import {
  EMPLOYMENT_LABEL,
  formatSalary,
  searchJobs,
  type BoardJob,
  type Branding
} from '../lib/api'

export default function LandingPage({
  branding,
  logo,
  onSearch
}: {
  branding: Branding
  logo: string | null
  onSearch: (query: string, location: string) => void
}) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [recent, setRecent] = useState<BoardJob[] | null>(null)

  useEffect(() => {
    let alive = true
    searchJobs('', '', 6, 0)
      .then((jobs) => alive && setRecent(jobs))
      .catch(() => alive && setRecent([]))
    return () => {
      alive = false
    }
  }, [])

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
          onSubmit={() => onSearch(query, location)}
          big
        />
      }
    >
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="hero-glow" aria-hidden />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-14 text-center sm:px-6 sm:pb-16 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="chip mx-auto border border-line bg-surface text-ink-600 shadow-soft"
          >
            <Sparkles size={13} style={{ color: 'var(--brand-primary)' }} />
            Só trabalhamos com empresas reais — todas credenciadas FLOW
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.06 }}
            className="mx-auto mt-5 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] tracking-[-0.03em] text-ink-950 sm:text-5xl"
          >
            O emprego certo,{' '}
            <span className="relative whitespace-nowrap text-brand-500">
              perto de você
              <svg
                className="absolute -bottom-1.5 left-0 w-full text-brand-400/70"
                viewBox="0 0 220 10"
                fill="none"
                aria-hidden
              >
                <path
                  d="M3 7C60 2.5 160 2.5 217 6.5"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-ink-500"
          >
            Vagas reais de empresas que usam o RH Inteligente. Sem spam, sem cadastro infinito:
            você se candidata em minutos e acompanha seu status até a contratação.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[13px] text-ink-500"
          >
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck size={15} style={{ color: branding.primary_color }} />
              Empresas credenciadas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={15} style={{ color: branding.primary_color }} /> Resposta do RH
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shield size={15} style={{ color: branding.primary_color }} /> Dados protegidos (LGPD)
            </span>
          </motion.div>
        </div>
      </section>

      {/* ---------- Vagas em destaque ---------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-[21px] font-semibold tracking-[-0.02em] text-ink-900">
              Vagas abertas agora
            </h2>
            <p className="mt-0.5 text-[13.5px] text-ink-500">
              Publicadas em tempo real pelo RH das empresas credenciadas
            </p>
          </div>
          {recent && recent.length > 0 ? (
            <button
              type="button"
              onClick={() => onSearch('', '')}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold transition-all hover:gap-2.5"
              style={{ color: branding.primary_color }}
            >
              Ver todas <ArrowRight size={15} />
            </button>
          ) : null}
        </div>

        {recent === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="card p-6">
                <div className="skeleton h-5 w-3/4" />
                <div className="skeleton mt-3 h-4 w-1/2" />
                <div className="skeleton mt-6 h-9 w-full" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-14 text-center">
            <Briefcase size={26} className="text-ink-300" />
            <p className="mt-3 font-display text-[16px] font-semibold text-ink-800">
              Nenhuma vaga aberta no momento
            </p>
            <p className="mt-1 max-w-sm text-[13.5px] text-ink-500">
              Assim que uma empresa credenciada publicar, ela aparece aqui na hora.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((job, index) => (
              <JobTile key={job.id} job={job} index={index} branding={branding} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- Como funciona ---------- */}
      <section className="border-t border-line bg-surface-2/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-center font-display text-[21px] font-semibold tracking-[-0.02em] text-ink-900">
            Como funciona
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                step: '1',
                title: 'Ache sua vaga',
                text: 'Busque pelo cargo e pela sua cidade. Só entram vagas de empresas reais credenciadas.'
              },
              {
                step: '2',
                title: 'Candidate-se em minutos',
                text: 'Um formulário curto, seu currículo e pronto — a candidatura já cria sua área do candidato.'
              },
              {
                step: '3',
                title: 'Acompanhe o status',
                text: 'Entre na Área do Candidato e veja onde sua inscrição está: análise, entrevista e contratação.'
              }
            ].map((item) => (
              <div key={item.step} className="card p-6">
                <span
                  className="flex size-9 items-center justify-center rounded-xl font-display text-[15px] font-bold text-white"
                  style={{ backgroundColor: branding.primary_color }}
                >
                  {item.step}
                </span>
                <h3 className="mt-3.5 font-display text-[15.5px] font-semibold text-ink-900">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </BoardLayout>
  )
}

function JobTile({ job, index, branding }: { job: BoardJob; index: number; branding: Branding }) {
  const salary = formatSalary(job)
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * Math.min(index, 5) }}
      whileHover={{ y: -4 }}
      className="card group flex cursor-pointer flex-col p-5 transition-shadow hover:shadow-lift"
      onClick={() => {
        window.location.href = `https://rh.flwdesk.com/digaspi/#/vaga/${job.slug}`
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="chip bg-ink-50 text-ink-600">
          {EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type}
        </span>
        {job.openings > 1 ? (
          <span className="chip bg-ink-50 text-ink-500">{job.openings} posições</span>
        ) : null}
      </div>
      <h3 className="mt-3 font-display text-[16.5px] font-semibold leading-snug tracking-[-0.015em] text-ink-900 transition-colors group-hover:text-brand-700">
        {job.title}
      </h3>
      <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600">
        <Building2 size={13.5} className="text-ink-400" />
        {job.company_name ?? 'Empresa credenciada'}
      </p>
      <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ink-500">
        <MapPin size={13.5} className="text-ink-400" />
        {job.location ?? job.work_model ?? 'Brasil'}
      </p>
      {salary ? (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
          <Wallet size={13.5} style={{ color: branding.primary_color }} />
          {salary}
        </p>
      ) : null}
      {job.description ? (
        <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-ink-500">
          {job.description}
        </p>
      ) : null}
      <span
        className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold transition-all group-hover:gap-2.5"
        style={{ color: branding.primary_color }}
      >
        Ver vaga <ArrowRight size={15} />
      </span>
    </motion.article>
  )
}
