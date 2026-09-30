import type { AuthUser } from '@/lib/auth'
import type { NavId } from '@/lib/navigation'
import type { RhApplicationStatus } from '@/lib/rh/types'
import { RhApplicationDetailPage, RhApplicationsPage } from './rh-applications'
import { RhInterviewsPage } from './rh-interviews'
import { RhJobEditorPage, RhJobsPage } from './rh-jobs'
import { RhOverviewPage } from './rh-overview'
import { RhSettingsPage } from './rh-settings'

type RhModuleProps = {
  user: AuthUser
  activeId: NavId
  jobId: string | null
  applicationId: string | null
  statusFilter: RhApplicationStatus | null
  onNavigate: (id: NavId) => void
  onOpenJob: (jobId: string) => void
  onCloseJob: () => void
  onOpenApplication: (applicationId: string) => void
  onCloseApplication: () => void
  onSetStatusFilter: (status: RhApplicationStatus | null) => void
}

/**
 * PORTAL DO RH — contêiner das 5 abas + páginas próprias (edição de vaga e
 * página do candidato). Segue o mesmo padrão deemployees: o Shell mantém os
 * ids (jobId/applicationId) e navegação por activeId (padrão do perfil de funcionário).
 */
export function RhModule({
  user,
  activeId,
  jobId,
  applicationId,
  statusFilter,
  onNavigate,
  onOpenJob,
  onCloseJob,
  onOpenApplication,
  onCloseApplication,
  onSetStatusFilter
}: RhModuleProps) {
  if (applicationId) {
    return (
      <RhApplicationDetailPage
        applicationId={applicationId}
        authorName={user.displayName}
        onBack={onCloseApplication}
      />
    )
  }

  if (jobId) {
    return <RhJobEditorPage jobId={jobId} onBack={onCloseJob} />
  }

  if (activeId === 'rh_overview') {
    return (
      <RhOverviewPage
        onNewJob={() => onOpenJob('new')}
        onOpenJob={(id) => {
          if (id === '__jobs__') onNavigate('rh_jobs')
          else onOpenJob(id)
        }}
        onOpenApplication={onOpenApplication}
        onOpenApplications={(status) => {
          onSetStatusFilter((status as RhApplicationStatus) ?? null)
          onNavigate('rh_applications')
        }}
        onOpenInterviews={() => onNavigate('rh_interviews')}
      />
    )
  }

  if (activeId === 'rh_jobs') {
    return <RhJobsPage onNewJob={() => onOpenJob('new')} onEditJob={onOpenJob} />
  }

  if (activeId === 'rh_applications') {
    return <RhApplicationsPage initialStatus={statusFilter} onOpenApplication={onOpenApplication} />
  }

  if (activeId === 'rh_interviews') {
    return <RhInterviewsPage onOpenApplication={onOpenApplication} />
  }

  return <RhSettingsPage />
}
