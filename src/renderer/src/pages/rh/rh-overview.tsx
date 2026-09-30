import { useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  CalendarClock,
  ClipboardList,
  Users,
  UserCheck,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { isMobileShell } from "@/lib/is-mobile-shell";
import {
  fetchApplications,
  fetchDashboardStats,
  fetchInterviewsWithContext,
  fetchJobs,
  type RhDashboardStats,
} from "@/lib/rh/api";
import { type RhApplication, type RhJob } from "@/lib/rh/types";
import {
  RhEmptyState,
  RhErrorState,
  RhPageHeader,
  RhPrimaryButton,
  RhSkeleton,
} from "./rh-ui";

type OverviewProps = {
  onNewJob: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenApplications: (statusFilter?: string) => void;
  onOpenInterviews: () => void;
};

export function RhOverviewPage({
  onNewJob,
  onOpenJob,
  onOpenApplication,
  onOpenApplications,
  onOpenInterviews,
}: OverviewProps) {
  const [stats, setStats] = useState<RhDashboardStats | null>(null);
  const [jobs, setJobs] = useState<RhJob[]>([]);
  const [recent, setRecent] = useState<RhApplication[]>([]);
  const [nextInterviews, setNextInterviews] = useState<
    Array<{ id: string; scheduled_at: string; name: string; job: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mobile = isMobileShell();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, jobsData, appsData, interviewsData] = await Promise.all(
        [
          fetchDashboardStats(),
          fetchJobs(),
          fetchApplications(),
          fetchInterviewsWithContext(),
        ],
      );
      setStats(statsData);
      setJobs(jobsData);
      setRecent(appsData.slice(0, 5));
      setNextInterviews(
        interviewsData
          .filter(
            (interview) =>
              new Date(interview.scheduled_at).getTime() >
              Date.now() - 3600_000,
          )
          .slice(0, 5)
          .map((interview) => ({
            id: interview.id,
            scheduled_at: interview.scheduled_at,
            name: interview.application?.candidate?.full_name ?? "Candidato",
            job: interview.application?.job?.title ?? "Vaga",
          })),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Erro ao carregar o painel.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openJobs = jobs.filter((job) => job.status === "open");

  return (
    <div className="flex flex-col">
      <RhPageHeader
        title="Contratações"
        subtitle="Visão geral do processo seletivo — vagas, candidatos e entrevistas."
        action={
          <RhPrimaryButton onClick={onNewJob}>+ Nova Vaga</RhPrimaryButton>
        }
      />

      {error ? (
        <RhErrorState message={error} onRetry={() => void load()} />
      ) : loading || !stats ? (
        <div className="grid flex-1 grid-rows-[auto_1fr] gap-3">
          <div
            className={
              mobile ? "grid grid-cols-1 gap-3" : "grid grid-cols-4 gap-3"
            }
          >
            <RhSkeleton className="h-[132px]" />
            <RhSkeleton className="h-[132px]" />
            <RhSkeleton className="h-[132px]" />
            <RhSkeleton className="h-[132px]" />
          </div>
          <div
            className={
              mobile ? "grid grid-cols-2 gap-3" : "grid grid-cols-4 gap-3"
            }
          >
            <RhSkeleton className="h-[96px]" />
            <RhSkeleton className="h-[96px]" />
            <RhSkeleton className="h-[96px]" />
            <RhSkeleton className="h-[96px]" />
          </div>
          <RhSkeleton className="min-h-[220px]" />
        </div>
      ) : (
        <>
          {/* ---------- Cards principais (mesmos do launcher) ---------- */}
          <div
            className={
              mobile ? "grid grid-cols-1 gap-3" : "grid grid-cols-3 gap-3"
            }
          >
            <MetricCard
              label="Vagas abertas"
              value={stats.openJobs}
              hint={`${stats.totalJobs} vagas no total`}
              icon={<Briefcase className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              label="Candidaturas"
              value={stats.totalApplications}
              hint={`${stats.newThisWeek} nesta semana`}
              icon={<Users className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              label="Entrevistas"
              value={stats.interviewsUpcoming}
              hint="agendadas a partir de agora"
              icon={<CalendarClock className="size-4" strokeWidth={1.7} />}
            />
          </div>

          {/* ---------- Cards compactos embaixo (mesmo padrão) ---------- */}
          <div
            className={
              mobile
                ? "mt-3 grid grid-cols-2 gap-3"
                : "mt-3 grid grid-cols-4 gap-3"
            }
          >
            <MetricCard
              compact
              label="Em análise"
              value={
                (stats.byStatus.in_review ?? 0) + (stats.byStatus.viewed ?? 0)
              }
              hint={`${stats.byStatus.submitted ?? 0} novas sem visualizar`}
              icon={<ClipboardList className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              compact
              label="Aprovados"
              value={stats.byStatus.approved ?? 0}
              hint="aguardando contratação"
              icon={<UserCheck className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              compact
              label="Pré-Aprovados"
              value={stats.hiresTotal}
              hint="contratados em onboarding"
              icon={<UserCheck className="size-4" strokeWidth={1.7} />}
              onClick={() => onOpenApplications("hired")}
            />
            <MetricCard
              compact
              label="Novas (7 dias)"
              value={stats.newThisWeek}
              hint="candidaturas recebidas"
              icon={<ClipboardList className="size-4" strokeWidth={1.7} />}
            />
          </div>

          {/* ---------- Vagas abertas + recentes + entrevistas ---------- */}
          <div
            className={
              mobile
                ? "mt-3 grid grid-cols-1 gap-3"
                : "mt-3 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3"
            }
          >
            <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] text-[#F0EFEC]/82">Vagas abertas</h2>
                <button
                  type="button"
                  onClick={() => onOpenJob("__jobs__")}
                  className="text-[12px] text-[#F0EFEC]/40 transition hover:text-[#F0EFEC]/70"
                >
                  Ver todas
                </button>
              </div>
              {openJobs.length === 0 ? (
                <p className="py-5 text-center text-[13px] text-[#F0EFEC]/35">
                  Nenhuma vaga aberta agora. Crie a primeira com “Nova Vaga”.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.035]">
                  {openJobs.slice(0, 5).map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => onOpenJob(job.id)}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:opacity-80"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] text-[#F0EFEC]/80">
                          {job.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-[#F0EFEC]/35">
                          {[job.department, job.location, job.work_model]
                            .filter(Boolean)
                            .join(" · ") || "Sem detalhes"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11.5px] text-[#F0EFEC]/40">
                        Aberta
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] text-[#F0EFEC]/82">
                  Candidaturas recentes
                </h2>
                <button
                  type="button"
                  onClick={() => onOpenApplications()}
                  className="text-[12px] text-[#F0EFEC]/40 transition hover:text-[#F0EFEC]/70"
                >
                  Ver central
                </button>
              </div>
              {recent.length === 0 ? (
                <RhEmptyState title="Sem candidaturas ainda" />
              ) : (
                <div className="divide-y divide-white/[0.035]">
                  {recent.map((application) => (
                    <button
                      key={application.id}
                      type="button"
                      onClick={() => onOpenApplication(application.id)}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:opacity-80"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] text-[#F0EFEC]/80">
                          {application.candidate?.full_name ?? "Candidato"}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-[#F0EFEC]/35">
                          {application.job?.title ?? "Vaga"} ·{" "}
                          {new Date(application.created_at).toLocaleDateString(
                            "pt-BR",
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11.5px] text-[#F0EFEC]/45">
                        {statusLabelShort(application.status)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="mt-3 shrink-0 rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[15px] text-[#F0EFEC]/82">
                Próximas entrevistas
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
              <p className="py-4 text-center text-[13px] text-[#F0EFEC]/35">
                Nenhuma entrevista agendada.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.035]">
                {nextInterviews.map((interview) => (
                  <div
                    key={interview.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-[#F0EFEC]/80">
                        {interview.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-[#F0EFEC]/35">
                        {interview.job}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-[#F0EFEC]/55">
                      {new Date(interview.scheduled_at).toLocaleString(
                        "pt-BR",
                        {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function statusLabelShort(status: RhApplication["status"] | string): string {
  const labels: Record<string, string> = {
    submitted: "Novo",
    viewed: "Visualizado",
    in_review: "Em análise",
    interview_online_scheduled: "Entrev. online",
    interview_presencial_scheduled: "Entrev. presencial",
    approved: "Aprovado",
    rejected: "Reprovado",
    hired: "Contratado",
  };
  return labels[status] ?? status;
}
