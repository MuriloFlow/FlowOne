import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  MapPin,
  Printer,
  Share2,
  UserRound
} from 'lucide-react'
import { Tick02Icon, UserMultipleIcon } from 'hugeicons-react'
import { BoardLayout } from '../components/Layout'
import { ButtonPair } from '../components/ui/ButtonPair'
import { Reveal } from '../components/ui/Reveal'
import {
  EMPLOYMENT_LABEL,
  fetchJobStats,
  formatSalary,
  jobApplyUrl,
  jobUrl,
  relativeDate,
  searchJobs,
  type BoardJob,
  type Branding,
  type JobStats
} from '../lib/api'
import { printArea, shareJob } from '../lib/print'
import { JobTile } from './LandingPage'

export default function JobPage({ slug, branding }: { slug: string; branding: Branding }) {
  const [job, setJob] = useState<BoardJob | null>(null)
  const [others, setOthers] = useState<BoardJob[]>([])
  const [stats, setStats] = useState<Record<string, JobStats>>({})
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    searchJobs('', '', 50, 0)
      .then((data) => {
        if (!alive) return
        const found = data.find((item) => item.slug === slug) ?? null
        setJob(found)
        setMissing(!found)
        setOthers(data.filter((item) => item.slug !== slug).slice(0, 3))
      })
      .catch(() => alive && setMissing(true))
    fetchJobStats().then((map) => alive && setStats(map))
    return () => {
      alive = false
    }
  }, [slug])

  useEffect(() => {
    if (job) document.title = `${job.title} — Recruta+`
  }, [job])

  const related = useMemo(
    () =>
      others
        .filter((item) => item.company_name === job?.company_name || item.location === job?.location)
        .slice(0, 3),
    [job, others]
  )

  if (missing) {
    return (
      <BoardLayout branding={branding}>
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6">
          <Briefcase size={30} className="text-ink-300" />
          <h1 className="mt-4 font-display text-[22px] font-bold text-ink-950">
            Vaga não encontrada
          </h1>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-500">
            Esta vaga pode ter sido fechada ou o endereço está errado. Veja as vagas abertas agora —
            novas oportunidades entram todo dia.
          </p>
          <div className="mt-6">
            <ButtonPair primaryLabel="Ver vagas abertas" primaryHref="/search" />
          </div>
        </div>
      </BoardLayout>
    )
  }

  if (!job) {
    return (
      <BoardLayout branding={branding}>
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton mt-4 h-5 w-1/3" />
          <div className="card mt-8 p-6">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton mt-3 h-4 w-5/6" />
            <div className="skeleton mt-3 h-4 w-4/6" />
          </div>
        </div>
      </BoardLayout>
    )
  }

  const salary = formatSalary(job)
  const applicants = stats[job.slug]?.applicants ?? 0

  return (
    <BoardLayout branding={branding}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <a
          href="/search"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft size={15} /> Voltar para as vagas
        </a>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          {/* Conteúdo da vaga */}
          <div className="card print-area p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-ink-50 text-ink-600">
                {EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type}
              </span>
              {job.work_model ? <span className="chip bg-ink-50 text-ink-500">{job.work_model}</span> : null}
              <span className="chip" style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}>
                Publicada {relativeDate(job.created_at)}
              </span>
            </div>

            <h1 className="mt-4 font-display text-[27px] font-bold leading-tight tracking-[-0.025em] text-ink-950 sm:text-[31px]">
              {job.title}
            </h1>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink-800">
              <Building2 size={16} className="text-ink-400" />
              {job.company_name ?? 'Empresa credenciada'}
              <span className="inline-flex" title="Empresa credenciada FLOW" style={{ color: branding.primary_color }}>
                <Tick02Icon size={16} />
              </span>
            </p>

            <div className="mt-4 grid gap-1.5 text-[14px] text-ink-600 sm:grid-cols-2">
              <p className="inline-flex items-center gap-2">
                <MapPin size={15} className="text-ink-400" /> {job.location ?? 'Brasil'}
              </p>
              {salary ? (
                <p className="inline-flex items-center gap-2 font-semibold text-ink-800">
                  <Banknote size={15} style={{ color: branding.primary_color }} /> {salary}
                </p>
              ) : null}
              <p className="inline-flex items-center gap-2">
                <Briefcase size={15} className="text-ink-400" />
                {job.openings > 1 ? `${job.openings} posições` : '1 posição'}
              </p>
              <p className="inline-flex items-center gap-2">
                <CalendarClock size={15} className="text-ink-400" />
                {new Date(job.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>

            {job.description ? (
              <>
                <h2 className="mt-7 font-display text-[16px] font-semibold text-ink-950">
                  Sobre a vaga
                </h2>
                <p className="prose-job mt-2.5 text-[14.5px] leading-relaxed text-ink-700">
                  {job.description}
                </p>
              </>
            ) : null}

            {job.requirements && job.requirements.length > 0 ? (
              <>
                <h2 className="mt-7 font-display text-[16px] font-semibold text-ink-950">
                  Pré-requisitos
                </h2>
                <ul className="mt-3 space-y-2">
                  {job.requirements.map((item, index) => (
                    <li key={index} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-700">
                      <span
                        className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {job.benefits && job.benefits.length > 0 ? (
              <>
                <h2 className="mt-7 font-display text-[16px] font-semibold text-ink-950">
                  Benefícios
                </h2>
                <ul className="mt-3 space-y-2">
                  {job.benefits.map((item, index) => (
                    <li key={index} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-700">
                      <span
                        className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          {/* Card de candidatura */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="card no-print p-6">
              {salary ? (
                <p className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-950">
                  {salary}
                </p>
              ) : null}
              <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ink-500">
                <UserMultipleIcon size={13.5} />
                {applicants > 0
                  ? `${applicants} pessoa${applicants > 1 ? 's' : ''} já se candidatou`
                  : 'Seja a primeira pessoa a se candidatar'}
              </p>
              <a
                href={jobApplyUrl(job.slug)}
                className="btn-primary-glow mt-4 w-full rounded-xl py-3.5 text-center text-[15px] font-bold"
              >
                CANDIDATAR-ME
              </a>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-400">
                <UserRound size={12} /> Sua Área do Candidato é criada na hora
              </p>
              <div className="mt-5 flex gap-2 border-t border-line pt-5">
                <button
                  type="button"
                  onClick={async () => {
                    const result = await shareJob({
                      title: `${job.title} — Recruta+`,
                      text: `Vaga de ${job.title} em ${job.location ?? 'Brasil'}`,
                      url: jobUrl(job.slug)
                    })
                    if (result === 'copied') window.alert('Link da vaga copiado!')
                  }}
                  className="btn-dark-soft flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13.5px] font-semibold"
                >
                  <Share2 size={15} /> Compartilhar
                </button>
                <button
                  type="button"
                  onClick={() => printArea()}
                  className="btn-dark-soft flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13.5px] font-semibold"
                >
                  <Printer size={15} /> Imprimir
                </button>
              </div>
              <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-400">
                Vaga publicada por {job.company_name ?? 'empresa credenciada'} via Flow Jobs · RH
                Inteligente
              </p>
            </div>
          </div>
        </div>

        {related.length > 0 ? (
          <Reveal className="mt-12">
            <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
              Outras vagas que podem combinar
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item, index) => (
                <JobTile key={item.id} job={item} index={index} branding={branding} />
              ))}
            </div>
          </Reveal>
        ) : null}
      </div>
    </BoardLayout>
  )
}
