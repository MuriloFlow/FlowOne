import { useCallback, useEffect, useState } from 'react'
import { Briefcase, CalendarClock, Users } from 'lucide-react'
import {
  fetchApplications,
  fetchDashboardStats,
  fetchInterviewsWithContext,
  fetchJobs,
  type RhDashboardStats
} from '@/lib/rh/api'
import {
  APPLICATION_STATUS_META,
  APPLICATION_PIPELINE_ORDER,
  type RhApplication,
  type RhJob
} from '@/lib/rh/types'
import { RhErrorState, RhMetricCard, RhPageHeader, RhPrimaryButton, RhSkeleton } from './rh-ui'

type OverviewProps = {
  onNewJob: () => void
  onOpenJob: (jobId: string) => void
  onOpenApplication: (applicationId: string) => void
  onOpenApplications: (statusFilter?: string) => void
  onOpenInterviews: () => void
}

export function RhOverviewPage({
  onNewJob,
  onOpenJob,
  onOpenApplication,
  onOpenApplications,
  onOpenInterviews
}: OverviewProps) {
  const [stats, setStats] = useState<RhDashboardStats | null>(null)
  const [jobs, setJobs] = useState<RhJob[]>([])
  const [recent, setRecent] = useState<RhApplication[]>([])
  const [nextInterviews, setNextInterviews] = useState<Array<{ id: string; scheduled_at: string; name: string; job: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsData, jobsData, appsData, interviewsData] = await Promise.all([
        fetchDashboardStats(),
        fetchJobs(),
        fetchApplications(),
        fetchInterviewsWithContext()
      ])
      setStats(statsData)
      setJobs(jobsData)
      setRecent(appsData.slice(0, 6))
      setNextInterviews(
        interviewsData
          .filter((interview) => new Date(interview.scheduled_at).getTime() > Date.now() - 3600_000)
          .slice(0, 5)
          .map((interview) => ({
            id: interview.id,
            scheduled_at: interview.scheduled_at,
            name: interview.application?.candidate?.full_name ?? 'Candidato',
            job: interview.application?.job?.title ?? 'Vaga'
          }))
      )
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o painel.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openJobs = jobs.filter((job) => job.status === 'open').slice(0, 5)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RhPageHeader
        title="Contratações"
        subtitle="Visão geral do processo seletivo — vagas, candidatos e entrevistas."
        action={
          <RhPrimaryButton onClick={onNewJob}>+ Nova Vaga</RhPrimaryButton>
        }
      />

      {error ? (
        <RhErrorState message={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <RhSkeleton className="h-[92px]" />
            <RhSkeleton className="h-[92px]" />
            <RhSkeleton className="h-[92px]" />
            <RhSkeleton className="h-[92px]" />
          </div>
          <div className="mt-3 grid flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
            <RhSkeleton className="min-h-[180px]" />
            <RhSkeleton className="min-h-[180px]" />
          </div>
        </div>
      ) : stats ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <RhMetricCard
              label="Vagas abertas"
              value={stats.openJobs}
              hint={`${stats.totalJobs} vagas no total`}
              tone="green"
              onClick={() => onOpenJob('__jobs__')}
            />
            <RhMetricCard
              label="Candidaturas"
              value={stats.totalApplications}
              hint={`${stats.newThisWeek} nesta semana`}
              onClick={() => onOpenApplications()}
            />
            <RhMetricCard
              label="Em análise"
              value={(stats.byStatus.in_review ?? 0) + (stats.byStatus.viewed ?? 0)}
              hint={`${stats.byStatus.submitted ?? 0} novas sem visualizar`}
              tone="amber"
              onClick={() => onOpenApplications('in_review')}
            />
            <RhMetricCard
              label="Entrevistas"
              value={stats.interviewsUpcoming}
              hint="agendadas a partir de agora"
              tone="violet"
              onClick={onOpenInterviews}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[#F0EFEC]/80">
                  <Users className="size-3.5 text-[#F0EFEC]/40" /> Pipeline de candidatos
                </h2>
                <button
                  type="button"
                  onClick={() => onOpenApplications()}
                  className="text-[12px] text-[#F0EFEC]/40 transition hover:text-[#F0EFEC]/70"
                >
                  Ver central
                </button>
              </div>
              <div className="space-y-2">
                {APPLICATION_PIPELINE_ORDER.map((status) => {
                  const meta = APPLICATION_STATUS_META[status]
                  const count = stats.byStatus[status] ?? 0
                  const percent = stats.totalApplications > 0 ? Math.round((count / stats.totalApplications) * 100) : 0
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => onOpenApplications(status)}
                      className="group flex w-full items-center gap-3 text-left"
                    >
                      <span className="w-[130px] shrink-0 truncate text-[12px] text-[#F0EFEC]/55 group-hover:text-[#F0EFEC]/80">
                        {meta.label}
                      </span>
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <span
                          className={`block h-full rounded-full ${meta.dot}`}
                          style={{ width: `${Math.max(percent, count > 0 ? 4 : 0)}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right text-[12px] tabular-nums text-[#F0EFEC]/70">{count}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[#F0EFEC]/80">
                  <Briefcase className="size-3.5 text-[#F0EFEC]/40" /> Vagas abertas
                </h2>
                <button
                  type="button"
                  onClick={() => onOpenJob('__jobs__')}
                  className="text-[12px] text-[#F0EFEC]/40 transition hover:text-[#F0EFEC]/70"
                >
                  Ver todas
                </button>
              </div>
              {openJobs.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-[#F0EFEC]/35">
                  Nenhuma vaga aberta agora. Crie a primeira com “Nova Vaga”.
                </p>
              ) : (
                <div className="space-y-1">
                  {openJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => onOpenJob(job.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-[10px] px-2 py-2 text-left transition hover:bg-white/[0.03]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-[#F0EFEC]/80">{job.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-[#F0EFEC]/35">
                          {[job.department, job.location, job.work_model].filter(Boolean).join(' · ') || 'Sem detalhes'}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200/90 uppercase">
                        Aberta
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-[#F0EFEC]/80">Candidaturas recentes</h2>
              {recent.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-[#F0EFEC]/35">
                  Sem candidaturas ainda. Elas aparecem aqui em tempo real.
                </p>
              ) : (
                <div className="space-y-1">
                  {recent.map((application) => {
                    const meta = APPLICATION_STATUS_META[application.status]
                    return (
                      <button
                        key={application.id}
                        type="button"
                        onClick={() => onOpenApplication(application.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-[10px] px-2 py-2 text-left transition hover:bg-white/[0.03]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-[#F0EFEC]/80">
                            {application.candidate?.full_name ?? 'Candidato'}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#F0EFEC]/35">
                            {application.job?.title ?? 'Vaga'} ·{' '}
                            {new Date(application.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[#F0EFEC]/80">
                  <CalendarClock className="size-3.5 text-[#F0EFEC]/40" /> Próximas entrevistas
                </h2>
                <button
                  type="button"
                  onClick={onOpenInterviews}
                  className="text-[12px] text-[#F0EFEC]/40 transition hover:text-[#F0EFEC]/70"
                >
                  Ver agenda
                </button>
              </div>
              {nextInterviews.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-[#F0EFEC]/35">
                  Nenhuma entrevista agendada.
                </p>
              ) : (
                <div className="space-y-1">
                  {nextInterviews.map((interview) => (
                    <div
                      key={interview.id}
                      className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-[#F0EFEC]/80">{interview.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-[#F0EFEC]/35">{interview.job}</span>
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[#F0EFEC]/55">
                        {new Date(interview.scheduled_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-2 gap-3 pb-1 lg:grid-cols-4">
            <RhMetricCard label="Contratados" value={stats.hiresTotal} tone="teal" />
            <RhMetricCard label="Aprovados" value={stats.byStatus.approved ?? 0} tone="green" />
            <RhMetricCard label="Novas (7 dias)" value={stats.newThisWeek} />
            <RhMetricCard
              label="Vagas encerradas"
              value={jobs.filter((job) => job.status === 'closed').length}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
