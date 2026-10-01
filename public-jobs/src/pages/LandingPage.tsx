import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
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
import {
  Building01Icon,
  Cursor01Icon,
  Route01Icon,
  Search01Icon,
  Shield01Icon,
  UserMultipleIcon,
  WorkflowSquare01Icon
} from 'hugeicons-react'
import { BoardLayout } from '../components/Layout'
import { SearchBar } from '../components/SearchBar'
import { Brand } from '../components/ui/Brand'
import { ButtonPair } from '../components/ui/ButtonPair'
import { BentoCard, BentoGrid } from '../components/ui/BentoGrid'
import { AnimatedBeam } from '../components/ui/AnimatedBeam'
import { Counter, Reveal } from '../components/ui/Reveal'
import { Faq, type FaqItem } from '../components/ui/Faq'
import { Globe } from '../components/ui/Globe'
import { IntroDisclosure, type IntroStep } from '../components/ui/IntroDisclosure'
import { TextAnimate } from '../components/ui/TextAnimate'
import { TrustedBy } from '../components/ui/TrustedBy'
import {
  EMPLOYMENT_LABEL,
  fetchCompanies,
  fetchJobStats,
  formatSalary,
  jobUrl,
  relativeDate,
  searchJobs,
  type BoardJob,
  type Branding,
  type JobStats
} from '../lib/api'

const FAQ: FaqItem[] = [
  {
    question: 'O Recruta+ é gratuito para quem está buscando vaga?',
    answer:
      'Sim, 100% gratuito. Você cria sua conta no momento da candidatura, se inscreve nas vagas que quiser e acompanha tudo pela Área do Candidato — sem pagar nada, nem assinatura, nem taxa escondida.'
  },
  {
    question: 'As empresas são confiáveis?',
    answer:
      'Todas as empresas que publicam vagas aqui passam pelo credenciamento do Flow Jobs (RH Inteligente). Isso significa CNPJ ativo, RH identificado e processo seletivo acompanhado dentro da plataforma — nada de anúncio anônimo.'
  },
  {
    question: 'Não encontrei vaga na minha cidade. E agora?',
    answer:
      'A gente procura por você. Quando não há vagas na cidade escolhida, o Recruta+ busca automaticamente até 3 cidades próximas — priorizando as que ficam na mesma linha de trem (CPTM). Em Ribeirão Pires, por exemplo, mostramos vagas de Santo André, Mauá e Rio Grande da Serra.'
  },
  {
    question: 'A busca entende se eu escrever errado?',
    answer:
      'Entende. O motor de busca do Recruta+ foi feito para o dia a dia: “vendendor”, “aux de limpeza” ou “estoqe” trazem os resultados certos. O campo “Onde?” também corrige o nome da cidade — digite “riberao pires” e confirme “Ribeirão Pires, SP”.'
  },
  {
    question: 'Preciso de currículo em PDF para me candidatar?',
    answer:
      'Não é obrigatório. O formulário é curto e leva poucos minutos. Se você tiver currículo em PDF, pode anexar — o RH recebe tudo junto com sua candidatura.'
  },
  {
    question: 'Como sei se o RH viu minha candidatura?',
    answer:
      'Na Área do Candidato cada inscrição aparece com o status atualizado em tempo real: inscrição recebida, currículo visualizado, em análise, entrevista agendada, aprovado ou contratado.'
  },
  {
    question: 'Meus dados ficam protegidos?',
    answer:
      'Sim. Seguimos a LGPD: seus dados são usados apenas no processo seletivo das vagas em que você se candidatou, ficam em servidores seguros e você pode pedir a exclusão a qualquer momento.'
  },
  {
    question: 'Sou empresa. Como faço para publicar vagas?',
    answer:
      'As vagas do Recruta+ são publicadas pelas empresas que usam o Flow Jobs — o módulo de RH Inteligente da Flowdesk. Fale com o nosso time para credenciar sua empresa e publicar suas vagas em minutos.'
  }
]

export default function LandingPage({
  branding,
  onSearch
}: {
  branding: Branding
  onSearch: (query: string, location: string) => void
}) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [jobs, setJobs] = useState<BoardJob[] | null>(null)
  const [companies, setCompanies] = useState<string[]>([])
  const [stats, setStats] = useState<Record<string, JobStats>>({})

  useEffect(() => {
    let alive = true
    searchJobs('', '', 50, 0)
      .then((data) => alive && setJobs(data))
      .catch(() => alive && setJobs([]))
    fetchCompanies().then((list) => alive && setCompanies(list))
    fetchJobStats().then((map) => alive && setStats(map))
    return () => {
      alive = false
    }
  }, [])

  const cities = useMemo(() => {
    const set = new Set<string>()
    for (const job of jobs ?? []) {
      const city = job.location?.split(',')[0]?.trim()
      if (city) set.add(city)
    }
    return set.size
  }, [jobs])

  return (
    <BoardLayout
      branding={branding}
      searchSlot={
        <SearchBar
          query={query}
          location={location}
          onQuery={setQuery}
          onLocation={setLocation}
          onSubmit={() => onSearch(query, location)}
          jobs={jobs ?? []}
          big
        />
      }
    >
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="hero-glow" aria-hidden />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-12 text-center sm:px-6 sm:pb-16 sm:pt-16">
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
            className="mt-8 flex justify-center"
          >
            <ButtonPair size="lg" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
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

          {/* Números do board (animados no scroll) */}
          <Reveal className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3" y={16}>
            {[
              { value: jobs?.length ?? 0, label: 'vagas abertas', suffix: '' },
              { value: cities, label: 'cidades atendidas', suffix: '' },
              { value: companies.length, label: 'empresas credenciadas', suffix: '' }
            ].map((item) => (
              <div key={item.label} className="card px-3 py-4">
                <Counter
                  value={item.value}
                  suffix={item.suffix}
                  className="font-display text-[26px] font-bold tracking-[-0.03em] text-ink-950"
                />
                <p className="mt-0.5 text-[12.5px] font-medium text-ink-500">{item.label}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ---------- Empresas que confiam no Recruta+ ---------- */}
      <section id="empresas" className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <Reveal className="text-center">
            <span className="chip-brand mx-auto">
              <Building01Icon size={12} /> Rede credenciada
            </span>
            <TextAnimate
              as="h2"
              text="Empresas que confiam no Recruta+"
              animation="blurInUp"
              className="mt-4 font-display text-[26px] font-bold tracking-[-0.025em] text-ink-950 sm:text-[30px]"
            />
            <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-500">
              Cada empresa passa pelo credenciamento do Flow Jobs. Vagas publicadas direto pelo RH —
              nada de intermediário.
            </p>
          </Reveal>

          <div className="mt-8 grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="min-w-0">
              <TrustedBy companies={companies} />
              <Reveal className="mt-6 grid gap-3 sm:grid-cols-2" y={18}>
                <div className="card p-5">
                  <span
                    className="flex size-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
                  >
                    <Shield01Icon size={18} />
                  </span>
                  <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
                    Credenciamento verificado
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                    Empresa com CNPJ ativo, RH identificado e processo seletivo acompanhado dentro da
                    plataforma.
                  </p>
                </div>
                <a
                  href="mailto:contato@flwdesk.com?subject=Quero%20credenciar%20minha%20empresa%20no%20Recruta%2B"
                  className="card group flex flex-col p-5 transition-shadow hover:shadow-lift"
                  style={{ borderStyle: 'dashed' }}
                >
                  <span className="flex size-10 items-center justify-center rounded-xl border border-line text-ink-500 transition-colors group-hover:text-brand-700">
                    <Building2 size={18} />
                  </span>
                  <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
                    Sua empresa aqui
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                    Credencie sua empresa no Flow Jobs e publique vagas com o RH Inteligente.
                  </p>
                  <span
                    className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold"
                    style={{ color: 'var(--brand-600)' }}
                  >
                    Quero publicar vagas <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </a>
              </Reveal>
            </div>

            <Reveal className="relative mx-auto w-full max-w-[440px] min-w-0" y={20}>
              <Globe />
              <div className="card absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2.5 px-4 py-2.5 shadow-lift">
                <span className="relative flex size-2.5">
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                    style={{ backgroundColor: branding.primary_color }}
                  />
                  <span
                    className="relative inline-flex size-2.5 rounded-full"
                    style={{ backgroundColor: branding.primary_color }}
                  />
                </span>
                <span className="text-[12.5px] font-semibold text-ink-700">
                  {companies.length > 0
                    ? `${companies.length} empresa${companies.length > 1 ? 's' : ''} publicando agora`
                    : 'Empresas publicando agora'}
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- Por que o Recruta+ (bento) ---------- */}
      <section className="border-b border-line bg-surface-2/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <Reveal className="text-center">
            <span className="chip-brand mx-auto">
              <Sparkles size={12} /> RH Inteligente
            </span>
            <TextAnimate
              as="h2"
              text="Tudo pensado para você achar a vaga certo"
              animation="blurInUp"
              className="mt-4 font-display text-[26px] font-bold tracking-[-0.025em] text-ink-950 sm:text-[30px]"
            />
            <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-500">
              A tecnologia do Recruta+ trabalha nos bastidores para você não perder tempo: busca
              inteligente, cidades próximas e status em tempo real.
            </p>
          </Reveal>

          <BentoGrid className="mt-9">
            <BentoCard
              className="md:col-span-2"
              icon={<Search01Icon size={19} style={{ color: 'var(--brand-600)' }} />}
              title="Busca que entende você"
              description="Escreveu “vendendor” ou “aux de limpeza”? O motor entende a intenção, corrige o termo e traz as vagas certas — com o trecho encontrado destacado."
            />
            <BentoCard
              icon={<Route01Icon size={19} style={{ color: 'var(--brand-600)' }} />}
              title="Cidades próximas automáticas"
              description="Sem vagas na sua cidade? Buscamos até 3 cidades vizinhas, priorizando a mesma linha de trem (CPTM)."
            />
            <BentoCard
              icon={<WorkflowSquare01Icon size={19} style={{ color: 'var(--brand-600)' }} />}
              title="Status em tempo real"
              description="Inscrição recebida, currículo visto, entrevista agendada, aprovado. Você acompanha cada etapa."
            />
            <BentoCard
              icon={<Cursor01Icon size={19} style={{ color: 'var(--brand-600)' }} />}
              title="Candidatura em minutos"
              description="Formulário curto, currículo opcional em PDF e sua área do candidato criada na hora."
            />
            <BentoCard
              className="md:col-span-2"
              icon={<Shield01Icon size={19} style={{ color: 'var(--brand-600)' }} />}
              title="Segurança e LGPD de verdade"
              description="Seus dados são usados apenas nos processos em que você se candidatou, em servidores seguros, e você pode solicitar a exclusão quando quiser."
            />
            <BentoCard
              icon={<UserMultipleIcon size={19} style={{ color: 'var(--brand-600)' }} />}
              title="Feito para todas as idades"
              description="Letras legíveis, botões grandes e zero complicação — o mesmo cuidado em celular, tablet e computador."
            />
          </BentoGrid>
        </div>
      </section>

      {/* ---------- Como funciona (intro disclosure + tudo se conecta) ---------- */}
      <section id="como-funciona" className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <Reveal className="text-center">
            <span className="chip-brand mx-auto">
              <Briefcase size={12} /> Passo a passo
            </span>
            <TextAnimate
              as="h2"
              text="Como funciona"
              animation="blurInUp"
              className="mt-4 font-display text-[26px] font-bold tracking-[-0.025em] text-ink-950 sm:text-[30px]"
            />
            <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-500">
              Três passos simples entre você e a contratação.
            </p>
          </Reveal>

          <Reveal className="mt-8">
            <IntroDisclosure steps={STEPS} />
          </Reveal>

          <Reveal className="mt-6">
            <ConnectDiagram branding={branding} />
          </Reveal>
        </div>
      </section>

      {/* ---------- Vagas abertas agora ---------- */}
      <section className="border-b border-line bg-surface-2/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-[24px] font-bold tracking-[-0.025em] text-ink-950">
                Vagas abertas agora
              </h2>
              <p className="mt-1 text-[13.5px] text-ink-500">
                Publicadas em tempo real pelo RH das empresas credenciadas
              </p>
            </div>
            {jobs && jobs.length > 0 ? (
              <a
                href="/search"
                className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold transition-all hover:gap-2.5"
                style={{ color: branding.primary_color }}
              >
                Ver todas <ArrowRight size={15} />
              </a>
            ) : null}
          </div>

          {jobs === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="card p-6">
                  <div className="skeleton h-5 w-3/4" />
                  <div className="skeleton mt-3 h-4 w-1/2" />
                  <div className="skeleton mt-6 h-9 w-full" />
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
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
              {jobs.slice(0, 6).map((job, index) => (
                <JobTile
                  key={job.id}
                  job={job}
                  index={index}
                  branding={branding}
                  applicants={stats[job.slug]?.applicants}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------- Dúvidas frequentes ---------- */}
      <section id="faq" className="border-b border-line">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
          <Reveal className="text-center">
            <span className="chip-brand mx-auto">Ajuda</span>
            <TextAnimate
              as="h2"
              text="Dúvidas frequentes"
              animation="blurInUp"
              className="mt-4 font-display text-[26px] font-bold tracking-[-0.025em] text-ink-950 sm:text-[30px]"
            />
            <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-500">
              Se ficar qualquer dúvida, é só perguntar para o RH dentro da vaga — a gente responde.
            </p>
          </Reveal>
          <Reveal className="mt-8" y={18}>
            <Faq items={FAQ} />
          </Reveal>
        </div>
      </section>

      {/* ---------- CTA final ---------- */}
      <section className="relative overflow-hidden">
        <div className="hero-glow" aria-hidden />
        <div className="relative mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6">
          <Reveal>
            <Brand />
            <h2 className="mx-auto mt-5 max-w-2xl text-balance font-display text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink-950 sm:text-[34px]">
              Comece agora a encontrar o emprego certo, perto de você
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-500">
              Mais de mil vagas publicadas por empresas credenciadas — e o motor do RH Inteligente
              trabalhando para o seu lado.
            </p>
            <div className="mt-7 flex justify-center">
              <ButtonPair size="lg" />
            </div>
            <p className="mt-5 text-[12.5px] text-ink-400">
              Grátis para candidatos · Sem taxa de inscrição · Área do candidato inclusa
            </p>
          </Reveal>
        </div>
      </section>
    </BoardLayout>
  )
}

const STEPS: IntroStep[] = [
  {
    title: 'Busque pelo cargo e pela sua cidade',
    content:
      'Digite o cargo do jeito que você fala — “vendedor”, “auxiliar de limpeza”, “fiscal de loja”. O campo “Onde?” sugere a cidade correta enquanto você digita.',
    icon: <Search01Icon size={30} />
  },
  {
    title: 'Candidate-se em minutos',
    content:
      'Escolha a vaga, confira o salário e os requisitos e clique em CANDIDATAR-ME. O formulário é curto e sua Área do Candidato é criada automaticamente.',
    icon: <Cursor01Icon size={30} />
  },
  {
    title: 'Acompanhe o status até a contratação',
    content:
      'Entre na Área do Candidato e veja cada etapa: currículo visualizado, em análise, entrevista agendada, aprovado e contratado. Tudo em tempo real.',
    icon: <WorkflowSquare01Icon size={30} />
  }
]

/** Diagrama "tudo se conecta": empresa → Recruta+ → você (feixes animados). */
function ConnectDiagram({ branding }: { branding: Branding }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const leftRef = useRef<HTMLDivElement | null>(null)
  const centerRef = useRef<HTMLDivElement | null>(null)
  const rightRef = useRef<HTMLDivElement | null>(null)

  return (
    <div className="card overflow-hidden p-6 sm:p-8">
      <div className="text-center">
        <h3 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink-950">
          Tudo se conecta
        </h3>
        <p className="mx-auto mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-ink-500">
          A empresa publica, o Recruta+ organiza, você acompanha — tudo no mesmo fluxo, sem perder
          nenhuma etapa pelo caminho.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative mt-8 flex items-center justify-between gap-4"
      >
        <AnimatedBeam containerRef={containerRef} fromRef={leftRef} toRef={centerRef} duration={2.8} />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={centerRef}
          toRef={rightRef}
          duration={2.8}
          delay={0.6}
        />

        <div ref={leftRef} className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-line bg-surface shadow-soft">
            <Building01Icon size={22} style={{ color: 'var(--brand-600)' }} />
          </span>
          <span className="text-[12.5px] font-semibold text-ink-700">Empresa credenciada</span>
        </div>

        <div ref={centerRef} className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center">
          <span
            className="flex size-[68px] items-center justify-center rounded-[20px] shadow-lift"
            style={{
              background: 'linear-gradient(140deg, var(--brand-400), var(--brand-700))'
            }}
          >
            <Brand tone="light" compact />
          </span>
          <span className="text-[12.5px] font-semibold text-ink-700">Recruta+</span>
        </div>

        <div ref={rightRef} className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-line bg-surface shadow-soft">
            <UserMultipleIcon size={22} style={{ color: branding.primary_color }} />
          </span>
          <span className="text-[12.5px] font-semibold text-ink-700">Você, contratado</span>
        </div>
      </div>
    </div>
  )
}

export function JobTile({
  job,
  index,
  branding,
  applicants
}: {
  job: BoardJob
  index: number
  branding: Branding
  applicants?: number
}) {
  const salary = formatSalary(job)
  return (
    <motion.a
      href={jobUrl(job.slug)}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: 0.05 * Math.min(index, 5) }}
      whileHover={{ y: -4 }}
      className="card group flex flex-col p-5 transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="chip bg-ink-50 text-ink-600">
          {EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type}
        </span>
        <span className="shrink-0 text-[11.5px] font-medium text-ink-400">
          {relativeDate(job.created_at)}
        </span>
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
      {typeof applicants === 'number' && applicants > 0 ? (
        <span className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ink-400">
          <UserMultipleIcon size={12} /> {applicants} pessoa{applicants > 1 ? 's' : ''} já se
          candidatou
        </span>
      ) : null}
    </motion.a>
  )
}
