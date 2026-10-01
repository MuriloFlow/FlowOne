import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock3,
  ListChecks,
  MapPin,
  Sparkles,
  Target,
  Users
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchJobBySlug } from '../lib/api'
import { EMPLOYMENT_TYPE_LABEL } from '../lib/types'
import type { RhJob } from '../lib/types'
import { formatSalary } from '../lib/format'
import { ErrorState } from '../components/ui/Kit'

// Página da vaga — clone da referência com identidade FLOW.

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }
}

export default function JobDetailPage({ slug, navigate }: { slug: string; navigate: (to: string) => void }) {
  const [job, setJob] = useState<RhJob | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setJob(null)
    setNotFound(false)
    fetchJobBySlug(slug)
      .then((data) => {
        if (!alive) return
        if (!data) setNotFound(true)
        else setJob(data)
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [slug])

  if (error) {
    return <ErrorState title="Não foi possível carregar a vaga" message={error} onRetry={() => window.location.reload()} />
  }

  if (notFound) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
          <Briefcase size={26} />
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Vaga não encontrada</h1>
        <p className="mt-2 max-w-sm text-[14.5px] text-ink-500">
          Esta vaga não está mais aberta ou o link é inválido. Confira as oportunidades disponíveis.
        </p>
        <button className="btn-brand mt-6" onClick={() => navigate('/')}>
          Ver vagas abertas
        </button>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <div className="skeleton h-8 w-2/3" />
        <div className="skeleton mt-4 h-4 w-1/2" />
        <div className="skeleton mt-10 h-40 w-full rounded-2xl" />
      </div>
    )
  }

  const salary = job.salary_visible ? formatSalary(job.salary_min, job.salary_max) : null

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <motion.button
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate('/')}
        className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft size={16} /> Todas as vagas
      </motion.button>

      {/* Cabeçalho */}
      <motion.header {...fadeUp} className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-brand-50 text-brand-700">
            {EMPLOYMENT_TYPE_LABEL[job.employment_type] ?? job.employment_type}
          </span>
          <span className="chip chip-brand-soft">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Aberta agora
          </span>
        </div>

        <h1 className="text-balance mt-3.5 font-display text-3xl font-bold leading-[1.12] tracking-[-0.03em] text-ink-950 sm:text-4xl">
          {job.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-ink-500">
          {job.department && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={15.5} className="text-ink-400" /> {job.department}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={15.5} className="text-ink-400" /> {job.location ?? job.work_model}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={15.5} className="text-ink-400" /> {job.work_model}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users size={15.5} className="text-ink-400" /> {job.openings > 1 ? `${job.openings} posições` : '1 posição'}
          </span>
          {salary && (
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-800">
              <Banknote size={15.5} className="text-brand-600" /> {salary}
            </span>
          )}
        </div>
      </motion.header>

      {/* CTA */}
      <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="mt-7">
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate(`/candidatar/${job.slug}`)}
          className="btn-brand w-full !py-3.5 !text-[15.5px] sm:w-auto sm:!px-8"
        >
          Quero me candidatar <ArrowRight size={17} />
        </motion.button>
      </motion.div>

      {/* Conteúdo */}
      <div className="mt-10 space-y-8">
        {job.description && (
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.14 }}>
            <div className="card p-6 sm:p-7">
              <SectionTitle icon={<Sparkles size={16} />} title="Sobre a oportunidade" />
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-600">{job.description}</p>
            </div>
          </motion.section>
        )}

        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.18 }}>
          <div className="card p-6 sm:p-7">
            <SectionTitle icon={<Target size={16} />} title="Principais responsabilidades" />
            {job.responsibilities?.length ? (
              <ul className="space-y-2.5">
                {job.responsibilities.map((r, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.04 }}
                    className="flex gap-2.5 text-[14.5px] leading-relaxed text-ink-600"
                  >
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand-500" />
                    {r}
                  </motion.li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-400">Detalhes informados durante o processo.</p>
            )}
          </div>
        </motion.section>

        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.22 }}>
          <div className="card p-6 sm:p-7">
            <SectionTitle icon={<ListChecks size={16} />} title="Requisitos" />
            {job.requirements?.length ? (
              <ul className="space-y-2.5">
                {job.requirements.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-[14.5px] leading-relaxed text-ink-600">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-400">Requisitos informados durante o processo.</p>
            )}
          </div>
        </motion.section>

        {job.benefits?.length > 0 && (
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.26 }}>
            <div className="card p-6 sm:p-7">
              <SectionTitle icon={<Banknote size={16} />} title="Benefícios" />
              <div className="flex flex-wrap gap-2">
                {job.benefits.map((b, i) => (
                  <span key={i} className="chip border border-ink-100 bg-ink-50 !text-ink-700">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </motion.section>
        )}

        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.3 }}>
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-6 text-center sm:p-8">
            <Briefcase size={22} className="mx-auto text-brand-500" />
            <h3 className="mt-3 font-display text-[17px] font-semibold text-ink-900">
              Pronto para dar o próximo passo?
            </h3>
            <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-500">
              O formulário leva cerca de 5 minutos. Você acompanha o status pelos dados informados.
            </p>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`/candidatar/${job.slug}`)}
              className="btn-brand mt-5"
            >
              Quero me candidatar <ArrowRight size={16} />
            </motion.button>
          </div>
        </motion.section>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 font-display text-[15.5px] font-semibold text-ink-900">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      {title}
    </h2>
  )
}
