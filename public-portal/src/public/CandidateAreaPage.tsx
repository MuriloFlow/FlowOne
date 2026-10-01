// ÁREA DO CANDIDATO — login/cadastro + lista de candidaturas com status em
// timeline. A candidatura feita no portal já vira o cadastro (login).
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  Clock,
  Lock,
  LogOut,
  Mail,
  Search,
  Sparkles,
  UserRound,
  XCircle
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  getSession,
  loginCandidate,
  logoutCandidate,
  signupCandidate,
  type CandidateSession
} from '../lib/candidate-auth'
import type { Branding } from '../lib/branding'

type ApplicationRow = {
  application_id: string
  job_title: string | null
  status: string
  status_label: string
  score: number | null
  created_at: string
  updated_at: string
}

const TIMELINE: Array<{ key: string[]; label: string }> = [
  { key: ['submitted'], label: 'Inscrição recebida' },
  { key: ['viewed'], label: 'Currículo visto' },
  { key: ['in_review'], label: 'Em análise' },
  {
    key: ['interview_online_scheduled', 'interview_presencial_scheduled'],
    label: 'Entrevista'
  },
  { key: ['approved'], label: 'Aprovado' },
  { key: ['hired'], label: 'Contratado' }
]

function stageIndex(status: string): number {
  if (status === 'rejected') return -1
  const index = TIMELINE.findIndex((stage) => stage.key.includes(status))
  return index < 0 ? 0 : index
}

export default function CandidateAreaPage({ branding }: { branding: Branding }) {
  const [session, setSession] = useState<CandidateSession | null>(null)
  const [booting, setBooting] = useState(true)
  const [rows, setRows] = useState<ApplicationRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getSession().then((value) => {
      if (alive) {
        setSession(value)
        setBooting(false)
      }
    })
    const { data } = supabase.auth.onAuthStateChange(() => {
      getSession().then((value) => alive && setSession(value))
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setRows(null)
      return
    }
    let alive = true
    setRows(null)
    setError(null)
    supabase
      .rpc('rh_candidate_applications')
      .then(({ data, error: rpcError }) => {
        if (!alive) return
        if (rpcError) setError(rpcError.message)
        else setRows((data ?? []) as ApplicationRow[])
      })
    return () => {
      alive = false
    }
  }, [session])

  if (booting) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
        <div className="skeleton mx-auto h-10 w-56" />
        <div className="skeleton mx-auto mt-4 h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      {!session ? (
        <AuthCard branding={branding} onSignedIn={() => void getSession().then(setSession)} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] text-ink-950">
                Olá, {(session.fullName ?? session.email).split(' ')[0]}! 👋
              </h1>
              <p className="mt-0.5 text-[13.5px] text-ink-500">
                Acompanhe suas candidaturas em tempo real.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logoutCandidate().then(() => setSession(null))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-[13px] font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-800"
            >
              <LogOut size={14} /> Sair
            </button>
          </div>

          {error ? (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
              {error}
            </p>
          ) : null}

          {rows === null && !error ? (
            <div className="mt-8 space-y-3">
              <div className="skeleton h-28 w-full" />
              <div className="skeleton h-28 w-full" />
            </div>
          ) : rows !== null && rows.length === 0 ? (
            <div className="card mt-8 flex flex-col items-center px-6 py-14 text-center">
              <Search size={26} className="text-ink-300" />
              <p className="mt-3 font-display text-[16px] font-semibold text-ink-800">
                Nenhuma candidatura ainda
              </p>
              <p className="mt-1 max-w-sm text-[13.5px] text-ink-500">
                Você ainda não se candidatou a nenhuma vaga. Veja as oportunidades abertas!
              </p>
              <a
                href="https://vagas.flwdesk.com/"
                className="btn-brand mt-5"
                style={{ backgroundColor: branding.primary_color }}
              >
                Ver vagas abertas
              </a>
            </div>
          ) : rows !== null ? (
            <div className="mt-8 space-y-4">
              {rows.map((row, index) => (
                <ApplicationTimelineCard
                  key={row.application_id}
                  row={row}
                  index={index}
                  branding={branding}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// ---------------- Login / Cadastro ----------------

function AuthCard({
  branding,
  onSignedIn
}: {
  branding: Branding
  onSignedIn: () => void
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const result =
        mode === 'signup'
          ? await signupCandidate({ email, password, fullName, phone })
          : await loginCandidate(email, password)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onSignedIn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-10 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: branding.primary_color }}
          >
            <UserRound size={20} />
          </span>
          <div>
            <h1 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink-950">
              Área do Candidato
            </h1>
            <p className="text-[12.5px] text-ink-400">
              Acompanhe suas candidaturas e o status delas
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1">
          {(['login', 'signup'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-lg py-2 text-[13.5px] font-semibold transition ${
                mode === value ? 'bg-surface text-ink-900 shadow-soft' : 'text-ink-400'
              }`}
            >
              {value === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {mode === 'signup' ? (
            <Field
              icon={<UserRound size={15} />}
              label="Nome completo"
              value={fullName}
              onChange={setFullName}
              placeholder="Seu nome completo"
            />
          ) : null}
          <Field
            icon={<Mail size={15} />}
            label="E-mail"
            value={email}
            onChange={setEmail}
            placeholder="voce@email.com"
            type="email"
          />
          {mode === 'signup' ? (
            <Field
              icon={<Sparkles size={15} />}
              label="WhatsApp (opcional)"
              value={phone}
              onChange={setPhone}
              placeholder="(11) 99999-9999"
              type="tel"
            />
          ) : null}
          <Field
            icon={<Lock size={15} />}
            label="Senha"
            value={password}
            onChange={setPassword}
            placeholder="Mínimo 6 caracteres"
            type="password"
          />

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !email.trim() || password.length < 6}
            className="btn-brand w-full !py-3 disabled:opacity-50"
            style={{ backgroundColor: branding.primary_color }}
          >
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar minha conta'}
          </button>

          {mode === 'signup' ? (
            <p className="text-center text-[12px] leading-relaxed text-ink-400">
              Sua candidatura existente é vinculada automaticamente — use o mesmo e-mail
              que usou ao se candidatar.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-ink-500">{label}</span>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300">
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="field-input !pl-10"
        />
      </div>
    </label>
  )
}

// ---------------- Card de candidatura com timeline ----------------

function ApplicationTimelineCard({
  row,
  index,
  branding
}: {
  row: ApplicationRow
  index: number
  branding: Branding
}) {
  const rejected = row.status === 'rejected'
  const current = stageIndex(row.status)
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * index }}
      className="card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-[16.5px] font-semibold text-ink-950">
            {row.job_title ?? 'Vaga'}
          </h3>
          <p className="mt-0.5 text-[12.5px] text-ink-400">
            Inscrição feita em {new Date(row.created_at).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <span
          className={`chip ${
            rejected
              ? 'bg-red-50 text-red-600'
              : row.status === 'hired' || row.status === 'approved'
                ? 'chip-brand-soft'
                : 'bg-ink-50 text-ink-600'
          }`}
        >
          {rejected ? <XCircle size={12.5} /> : <BadgeCheck size={12.5} />}
          {row.status_label}
        </span>
      </div>

      {/* Timeline */}
      <div className="mt-5 flex items-center">
        {TIMELINE.map((stage, index) => {
          const done = !rejected && index <= current
          const isCurrent = !rejected && index === current
          return (
            <div key={stage.label} className="flex min-w-0 flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition"
                  style={{
                    borderColor: done ? 'var(--brand-500)' : 'var(--line)',
                    backgroundColor: done ? 'var(--brand-500)' : 'var(--surface)',
                    color: done ? 'var(--brand-contrast)' : 'var(--ink-300)'
                  }}
                >
                  {done ? '✓' : index + 1}
                </span>
                <span
                  className={`mt-1 hidden whitespace-nowrap text-[10.5px] font-medium sm:block ${
                    isCurrent ? 'text-ink-800' : 'text-ink-400'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {index < TIMELINE.length - 1 ? (
                <div
                  className="mx-1 h-0.5 flex-1 rounded-full"
                  style={{
                    backgroundColor:
                      !rejected && index < current ? 'var(--brand-500)' : 'var(--line)'
                  }}
                />
              ) : null}
            </div>
          )
        })}
      </div>

      {rejected ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] leading-relaxed text-red-700">
          Não foi desta vez — mas seu perfil continua ativo para as próximas vagas. 💪
        </p>
      ) : row.status === 'hired' ? (
        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-[12.5px] leading-relaxed text-brand-700">
          Parabéns, você foi contratado! O RH entrará em contato com os próximos passos. 🎉
        </p>
      ) : (
        <p className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-400">
          <Clock size={12.5} /> Última atualização{' '}
          {new Date(row.updated_at).toLocaleDateString('pt-BR')}
        </p>
      )}
    </motion.article>
  )
}


