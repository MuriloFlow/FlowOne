import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  ExternalLink,
  Filter,
  GitCompareArrows,
  MapPin,
  Printer,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  X
} from 'lucide-react'
import { Tick02Icon, UserMultipleIcon } from 'hugeicons-react'
import { BoardLayout } from '../components/Layout'
import { SearchBar } from '../components/SearchBar'
import { Highlight } from '../components/ui/Highlight'
import {
  EMPLOYMENT_LABEL,
  fetchJobStats,
  formatSalary,
  jobApplyUrl,
  jobPortalUrl,
  jobUrl,
  relativeDate,
  searchJobs,
  type BoardJob,
  type Branding,
  type JobStats
} from '../lib/api'
import { normalize, rankJobs, scoreToAdequacy, tokenize } from '../lib/fuzzy'
import { cityLabel, nearbyCities, parseCityInput } from '../lib/geo'
import { printArea, shareJob } from '../lib/print'

type Tab = 'vaga' | 'empresa' | 'comparativo'
type Sort = 'relevantes' | 'recentes' | 'salario'
type NearbyJob = BoardJob & { viaCity: string }

function readParams(): { query: string; location: string } {
  const params = new URLSearchParams(window.location.search)
  return { query: params.get('query') ?? '', location: params.get('location') ?? '' }
}

const PUBLISHED_OPTIONS = [
  { value: 0, label: 'Qualquer data' },
  { value: 1, label: 'Últimas 24 horas' },
  { value: 7, label: 'Últimos 7 dias' },
  { value: 30, label: 'Últimos 30 dias' }
] as const

const SALARY_OPTIONS = [0, 1500, 2000, 2500, 3000, 4000, 5000] as const

export default function SearchPage({ branding }: { branding: Branding }) {
  const initial = useMemo(readParams, [])
  const [query, setQuery] = useState(initial.query)
  const [location, setLocation] = useState(initial.location)
  const [allJobs, setAllJobs] = useState<BoardJob[] | null>(null)
  const [stats, setStats] = useState<Record<string, JobStats>>({})
  const [selected, setSelected] = useState<BoardJob | null>(null)
  const [tab, setTab] = useState<Tab>('vaga')
  const [sort, setSort] = useState<Sort>('relevantes')
  const [compare, setCompare] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Filtros
  const [types, setTypes] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [salaryMin, setSalaryMin] = useState(0)
  const [publishedWithin, setPublishedWithin] = useState(0)
  const [onlyWithSalary, setOnlyWithSalary] = useState(false)

  // Cidades próximas (quando a cidade buscada não tem vagas)
  const [nearby, setNearby] = useState<{
    cities: string[]
    source: 'cptm' | 'mapa'
    line: string | null
  } | null>(null)
  const [nearbyJobs, setNearbyJobs] = useState<NearbyJob[] | null>(null)
  const [nearbyBusy, setNearbyBusy] = useState(false)

  useEffect(() => {
    let alive = true
    searchJobs('', '', 50, 0)
      .then((data) => alive && setAllJobs(data))
      .catch(() => alive && setAllJobs([]))
    fetchJobStats().then((map) => alive && setStats(map))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())
    if (location.trim()) params.set('location', location.trim())
    window.history.replaceState(null, '', `/search${params.toString() ? `?${params}` : ''}`)
  }, [query, location])

  function showToast(message: string): void {
    setToast(message)
    window.setTimeout(() => setToast(null), 2600)
  }

  // ---------- Pipeline: cidade → busca fuzzy → filtros → ordenação ----------
  const results = useMemo(() => {
    if (!allJobs) return []
    const cityTerm = location.split(',')[0].trim()
    let base = allJobs
    if (cityTerm) {
      const needle = normalize(cityTerm)
      base = base.filter((job) => {
        const haystack = normalize(`${job.location ?? ''} ${job.work_model ?? ''}`)
        return haystack.includes(needle)
      })
    }
    const ranked = rankJobs(query, base)
    return applyFilters(ranked, { types, models, salaryMin, publishedWithin, onlyWithSalary })
  }, [allJobs, location, models, onlyWithSalary, publishedWithin, query, salaryMin, types])

  const sorted = useMemo(() => sortResults(results, sort), [results, sort])

  // Sem resultados na cidade → busca até 3 cidades próximas (linha da CPTM)
  const cityTerm = location.split(',')[0].trim()
  useEffect(() => {
    let alive = true
    if (!allJobs || !cityTerm || results.length > 0) {
      setNearby(null)
      setNearbyJobs(null)
      return
    }
    setNearbyBusy(true)
    nearbyCities(cityTerm, 3)
      .then(async (result) => {
        if (!alive) return
        setNearby(result)
        if (result.cities.length === 0) {
          setNearbyJobs([])
          return
        }
        const found: NearbyJob[] = []
        for (const city of result.cities) {
          const jobs = await searchJobs(query, city, 20, 0)
          for (const job of jobs) {
            if (!found.some((item) => item.id === job.id)) found.push({ ...job, viaCity: city })
          }
        }
        if (alive) setNearbyJobs(found)
      })
      .catch(() => {
        if (alive) {
          setNearby({ cities: [], source: 'mapa', line: null })
          setNearbyJobs([])
        }
      })
      .finally(() => alive && setNearbyBusy(false))
    return () => {
      alive = false
    }
  }, [allJobs, cityTerm, query, results.length])

  const employmentTypes = useMemo(() => {
    const set = new Set<string>()
    for (const job of allJobs ?? []) set.add(job.employment_type)
    return [...set]
  }, [allJobs])

  const workModels = useMemo(() => {
    const set = new Set<string>()
    for (const job of allJobs ?? []) {
      const model = (job.work_model ?? '').trim()
      if (model) set.add(model.charAt(0).toUpperCase() + model.slice(1))
    }
    return [...set]
  }, [allJobs])

  const activeFilterCount =
    types.length + models.length + (salaryMin > 0 ? 1 : 0) + (publishedWithin > 0 ? 1 : 0) + (onlyWithSalary ? 1 : 0)

  function resetFilters(): void {
    setTypes([])
    setModels([])
    setSalaryMin(0)
    setPublishedWithin(0)
    setOnlyWithSalary(false)
  }

  async function handleSearch(): Promise<void> {
    // Confirma a cidade digitada à mão (ex.: "riberao pires" → "Ribeirão Pires, SP")
    const typed = location.trim()
    if (typed && !typed.includes(',')) {
      const parsed = await parseCityInput(typed)
      if (parsed) setLocation(cityLabel(parsed))
    }
  }

  function toggleCompare(id: string): void {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 3) {
        showToast('Você pode comparar até 3 vagas por vez.')
        return current
      }
      return [...current, id]
    })
  }

  const compareJobs = useMemo(
    () => (allJobs ?? []).filter((job) => compare.includes(job.id)),
    [allJobs, compare]
  )

  const totalFound = sorted.length + (nearbyJobs?.length ?? 0)

  return (
    <BoardLayout
      branding={branding}
      searchSlot={
        <SearchBar
          query={query}
          location={location}
          onQuery={setQuery}
          onLocation={setLocation}
          onSubmit={() => void handleSearch()}
          jobs={allJobs ?? []}
        />
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {/* Abas */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-soft">
            {([
              ['vaga', 'VAGA', Search],
              ['empresa', 'EMPRESA', Building2],
              ['comparativo', 'COMPARATIVO', GitCompareArrows]
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`tab inline-flex items-center gap-1.5 ${
                  tab === value ? 'tab-active' : 'tab-idle'
                }`}
              >
                <Icon size={13.5} />
                {label}
                {value === 'comparativo' && compare.length > 0 ? (
                  <span
                    className="ml-0.5 rounded-full px-1.5 text-[10.5px] font-bold"
                    style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
                  >
                    {compare.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink-600 shadow-soft transition-colors hover:text-ink-900 lg:hidden"
            >
              <SlidersHorizontal size={14} />
              Filtros
              {activeFilterCount > 0 ? (
                <span
                  className="rounded-full px-1.5 text-[10.5px] font-bold"
                  style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
            <div className="flex items-center gap-1">
              {([
                ['relevantes', 'Relevantes'],
                ['recentes', 'Recentes'],
                ['salario', 'Salário']
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSort(value)}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                    sort === value
                      ? 'bg-ink-900 text-ink-50'
                      : 'text-ink-500 hover:bg-surface-2 hover:text-ink-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Linha de resumo */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-500">
          {allJobs === null ? (
            'Buscando vagas…'
          ) : (
            <>
              <span>
                <b className="font-semibold text-ink-900">{totalFound}</b>{' '}
                {totalFound === 1 ? 'vaga encontrada' : 'vagas encontradas'}
                {cityTerm ? (
                  <>
                    {' '}
                    em <b className="font-semibold text-ink-700">{cityTerm}</b>
                  </>
                ) : null}
                {query.trim() ? (
                  <>
                    {' '}
                    para “<b className="font-semibold text-ink-700">{query.trim()}</b>”
                  </>
                ) : null}
              </span>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-500 transition-colors hover:text-ink-900"
                >
                  <RotateCcw size={12} /> limpar {activeFilterCount} filtro
                  {activeFilterCount > 1 ? 's' : ''}
                </button>
              ) : null}
            </>
          )}
        </div>

        {/* Banner de cidades próximas */}
        {nearby && nearbyJobs !== null ? (
          <NearbyBanner
            city={cityTerm}
            nearby={nearby}
            jobs={nearbyJobs}
            busy={nearbyBusy}
            onPickCity={(city) => {
              setLocation(city)
              setNearby(null)
              setNearbyJobs(null)
            }}
          />
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[268px_1fr]">
          {/* ---------- Filtros (desktop) ---------- */}
          <aside className="hidden lg:block">
            <div className="sticky top-4">
              <FilterPanel
                types={types}
                setTypes={setTypes}
                models={models}
                setModels={setModels}
                employmentTypes={employmentTypes}
                workModels={workModels}
                salaryMin={salaryMin}
                setSalaryMin={setSalaryMin}
                publishedWithin={publishedWithin}
                setPublishedWithin={setPublishedWithin}
                onlyWithSalary={onlyWithSalary}
                setOnlyWithSalary={setOnlyWithSalary}
                onReset={resetFilters}
                activeCount={activeFilterCount}
              />
            </div>
          </aside>

          {/* ---------- Conteúdo ---------- */}
          <div className="min-w-0">
            {tab === 'empresa' ? (
              <CompanyTab jobs={sorted} branding={branding} onPick={(job) => {
                setSelected(job)
                setTab('vaga')
              }} />
            ) : tab === 'comparativo' ? (
              <CompareTab
                jobs={compareJobs}
                stats={stats}
                branding={branding}
                onRemove={(id) => setCompare((current) => current.filter((item) => item !== id))}
                onBackToSearch={() => setTab('vaga')}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.05fr]">
                {/* Lista */}
                <div className="space-y-3">
                  {allJobs === null ? (
                    <>
                      <ResultSkeleton />
                      <ResultSkeleton />
                      <ResultSkeleton />
                    </>
                  ) : sorted.length === 0 ? (
                    <EmptyState
                      busy={nearbyBusy}
                      hasNearby={(nearbyJobs?.length ?? 0) > 0}
                      onClear={() => {
                        setQuery('')
                        setLocation('')
                        resetFilters()
                      }}
                    />
                  ) : (
                    sorted.map((item) => (
                      <ResultCard
                        key={item.job.id}
                        job={item.job}
                        query={query}
                        branding={branding}
                        adequacy={query.trim() ? item.adequacy : null}
                        applicants={stats[item.job.slug]?.applicants}
                        active={selected?.id === item.job.id}
                        comparing={compare.includes(item.job.id)}
                        onToggleCompare={() => toggleCompare(item.job.id)}
                        onClick={() => setSelected(item.job)}
                      />
                    ))
                  )}

                  {/* Vagas em cidades próximas */}
                  {nearbyJobs && nearbyJobs.length > 0 ? (
                    <div className="pt-2">
                      <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-400">
                        <TrainFront size={13} className="text-brand-600" /> Cidades próximas
                      </p>
                      <div className="space-y-3">
                        {nearbyJobs.map((job) => (
                          <ResultCard
                            key={`nearby-${job.id}`}
                            job={job}
                            query={query}
                            branding={branding}
                            adequacy={query.trim() ? scoreToAdequacy(rankJobs(query, [job])[0]?.score ?? 0) : null}
                            applicants={stats[job.slug]?.applicants}
                            active={selected?.id === job.id}
                            comparing={compare.includes(job.id)}
                            onToggleCompare={() => toggleCompare(job.id)}
                            onClick={() => setSelected(job)}
                            viaCity={job.viaCity}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Painel de detalhe */}
                <div className="hidden xl:block">
                  <div className="sticky top-4">
                    {selected ? (
                      <JobDetailPanel
                        job={selected}
                        query={query}
                        branding={branding}
                        stats={stats[selected.slug]}
                        onClose={() => setSelected(null)}
                        onToast={showToast}
                      />
                    ) : (
                      <div className="card flex flex-col items-center justify-center px-8 py-16 text-center">
                        <ClipboardList size={28} className="text-ink-200" />
                        <p className="mt-3 font-display text-[15.5px] font-semibold text-ink-700">
                          Selecione uma vaga
                        </p>
                        <p className="mt-1 max-w-xs text-[13px] text-ink-400">
                          Clique em um resultado à esquerda para ver todos os detalhes e se
                          candidatar.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detalhe no mobile/tablet */}
        {selected && tab === 'vaga' ? (
          <div className="mt-4 xl:hidden">
            <JobDetailPanel
              job={selected}
              query={query}
              branding={branding}
              stats={stats[selected.slug]}
              onClose={() => setSelected(null)}
              onToast={showToast}
            />
          </div>
        ) : null}
      </div>

      {/* Filtros no mobile (drawer) */}
      <AnimatePresence>
        {filtersOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFiltersOpen(false)}
              className="fixed inset-0 z-50 bg-ink-950/45 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto rounded-t-3xl border-t border-line bg-page p-4 pb-8 lg:hidden"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-[16px] font-semibold text-ink-900">Filtros</p>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="flex size-8 items-center justify-center rounded-full border border-line text-ink-500"
                  aria-label="Fechar filtros"
                >
                  <X size={15} />
                </button>
              </div>
              <FilterPanel
                types={types}
                setTypes={setTypes}
                models={models}
                setModels={setModels}
                employmentTypes={employmentTypes}
                workModels={workModels}
                salaryMin={salaryMin}
                setSalaryMin={setSalaryMin}
                publishedWithin={publishedWithin}
                setPublishedWithin={setPublishedWithin}
                onlyWithSalary={onlyWithSalary}
                setOnlyWithSalary={setOnlyWithSalary}
                onReset={resetFilters}
                activeCount={activeFilterCount}
              />
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="btn-primary-glow mt-4 w-full rounded-xl py-3 text-[14.5px] font-bold"
              >
                Ver {sorted.length} vaga{sorted.length === 1 ? '' : 's'}
              </button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-medium text-ink-50 shadow-lift"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </BoardLayout>
  )
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

type Filters = {
  types: string[]
  models: string[]
  salaryMin: number
  publishedWithin: number
  onlyWithSalary: boolean
}

function applyFilters(
  ranked: Array<{ job: BoardJob; score: number; adequacy: number; matchedWord: string | null }>,
  filters: Filters
) {
  const cutoff = filters.publishedWithin
    ? Date.now() - filters.publishedWithin * 86_400_000
    : 0
  return ranked.filter(({ job }) => {
    if (filters.types.length > 0 && !filters.types.includes(job.employment_type)) return false
    if (filters.models.length > 0) {
      const model = normalize(job.work_model ?? '')
      const hit = filters.models.some((value) => model === normalize(value))
      if (!hit) return false
    }
    if (filters.salaryMin > 0) {
      const salary = job.salary_max ?? job.salary_min ?? 0
      if (!job.salary_visible || salary < filters.salaryMin) return false
    }
    if (filters.onlyWithSalary && !job.salary_visible) return false
    if (cutoff && new Date(job.created_at).getTime() < cutoff) return false
    return true
  })
}

function sortResults(
  ranked: Array<{ job: BoardJob; score: number; adequacy: number }>,
  sort: Sort
): Array<{ job: BoardJob; score: number; adequacy: number }> {
  const list = [...ranked]
  if (sort === 'recentes') {
    list.sort(
      (a, b) => new Date(b.job.created_at).getTime() - new Date(a.job.created_at).getTime()
    )
  } else if (sort === 'salario') {
    list.sort(
      (a, b) =>
        (b.job.salary_max ?? b.job.salary_min ?? 0) - (a.job.salary_max ?? a.job.salary_min ?? 0)
    )
  }
  return list
}

function FilterPanel({
  types,
  setTypes,
  models,
  setModels,
  employmentTypes,
  workModels,
  salaryMin,
  setSalaryMin,
  publishedWithin,
  setPublishedWithin,
  onlyWithSalary,
  setOnlyWithSalary,
  onReset,
  activeCount
}: {
  types: string[]
  setTypes: (value: string[]) => void
  models: string[]
  setModels: (value: string[]) => void
  employmentTypes: string[]
  workModels: string[]
  salaryMin: number
  setSalaryMin: (value: number) => void
  publishedWithin: number
  setPublishedWithin: (value: number) => void
  onlyWithSalary: boolean
  setOnlyWithSalary: (value: boolean) => void
  onReset: () => void
  activeCount: number
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
          <Filter size={13} /> Filtros
        </span>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[12px] font-semibold text-ink-400 transition-colors hover:text-ink-900"
          >
            Limpar
          </button>
        ) : null}
      </div>

      <FilterGroup title="Modelo de trabalho">
        {workModels.length === 0 ? (
          <p className="text-[12.5px] text-ink-400">Sem opções no momento</p>
        ) : (
          workModels.map((model) => (
            <CheckRow
              key={model}
              label={model}
              checked={models.includes(model)}
              onChange={() =>
                setModels(
                  models.includes(model)
                    ? models.filter((item) => item !== model)
                    : [...models, model]
                )
              }
            />
          ))
        )}
      </FilterGroup>

      <FilterGroup title="Contrato">
        {employmentTypes.map((type) => (
          <CheckRow
            key={type}
            label={EMPLOYMENT_LABEL[type] ?? type}
            checked={types.includes(type)}
            onChange={() =>
              setTypes(types.includes(type) ? types.filter((item) => item !== type) : [...types, type])
            }
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Salário mínimo">
        <select
          value={salaryMin}
          onChange={(event) => setSalaryMin(Number(event.target.value))}
          className="field-input !py-2 text-[13px]"
        >
          {SALARY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value === 0
                ? 'Qualquer valor'
                : `A partir de ${value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup title="Publicação">
        {PUBLISHED_OPTIONS.map((option) => (
          <CheckRow
            key={option.value}
            label={option.label}
            radio
            checked={publishedWithin === option.value}
            onChange={() => setPublishedWithin(option.value)}
          />
        ))}
      </FilterGroup>

      <div className="px-4 py-4">
        <CheckRow
          label="Só vagas com salário visível"
          checked={onlyWithSalary}
          onChange={() => setOnlyWithSalary(!onlyWithSalary)}
        />
      </div>
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-4">
      <p className="mb-2.5 text-[12.5px] font-bold text-ink-800">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
  radio = false
}: {
  label: string
  checked: boolean
  onChange: () => void
  radio?: boolean
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-600 transition-colors hover:text-ink-900">
      <span
        className={`flex size-[18px] shrink-0 items-center justify-center border transition-all ${
          radio ? 'rounded-full' : 'rounded-[6px]'
        }`}
        style={{
          borderColor: checked ? 'var(--brand-500)' : 'var(--ink-200)',
          backgroundColor: checked ? 'var(--brand-500)' : 'transparent'
        }}
      >
        {checked ? <Check size={12} color="var(--brand-contrast)" strokeWidth={3} /> : null}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function NearbyBanner({
  city,
  nearby,
  jobs,
  busy,
  onPickCity
}: {
  city: string
  nearby: { cities: string[]; source: 'cptm' | 'mapa'; line: string | null }
  jobs: NearbyJob[]
  busy: boolean
  onPickCity: (city: string) => void
}) {
  const counts = new Map<string, number>()
  for (const job of jobs) counts.set(job.viaCity, (counts.get(job.viaCity) ?? 0) + 1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 overflow-hidden rounded-2xl border p-4 sm:p-5"
      style={{ borderColor: 'var(--brand-ring)', backgroundColor: 'var(--brand-soft)' }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface shadow-soft"
          style={{ color: 'var(--brand-700)' }}
        >
          <TrainFront size={18} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink-950">
            Nenhuma vaga em {city}
            {nearby.cities.length > 0 ? ' — ampliamos a busca para você' : ''}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
            {busy
              ? 'Procurando vagas nas cidades próximas…'
              : nearby.cities.length > 0
                ? nearby.source === 'cptm'
                  ? `Buscamos nas cidades da ${nearby.line ?? 'linha de trem'} — quem mora em ${city} chega fácil de trem:`
                  : `Buscamos nos municípios mais próximos de ${city}:`
                : 'Não encontramos vagas nas cidades próximas por enquanto. Tente outra cidade ou limpe a busca.'}
          </p>
          {nearby.cities.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {nearby.cities.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onPickCity(name)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 shadow-soft transition-all hover:-translate-y-0.5"
                >
                  <MapPin size={12} style={{ color: 'var(--brand-600)' }} />
                  {name}
                  {counts.get(name) ? (
                    <span className="text-ink-400">
                      · {counts.get(name)} vaga{counts.get(name) === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
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

function EmptyState({
  busy,
  hasNearby,
  onClear
}: {
  busy: boolean
  hasNearby: boolean
  onClear: () => void
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {busy ? (
        <div className="skeleton size-8 rounded-full" />
      ) : (
        <Search size={26} className="text-ink-300" />
      )}
      <p className="mt-3 font-display text-[16px] font-semibold text-ink-800">
        {busy ? 'Ampliando a busca…' : 'Nenhuma vaga encontrada'}
      </p>
      <p className="mt-1 max-w-sm text-[13.5px] text-ink-500">
        {hasNearby
          ? 'Mas achamos vagas em cidades próximas — veja abaixo.'
          : 'Tente outro cargo, remova um filtro ou busque uma cidade próxima — novas vagas entram todo dia.'}
      </p>
      {!busy ? (
        <button type="button" onClick={onClear} className="btn-dark-soft mt-5 !py-2 !text-[13px]">
          Limpar busca
        </button>
      ) : null}
    </div>
  )
}

function ResultCard({
  job,
  query,
  branding,
  adequacy,
  applicants,
  active,
  comparing,
  onToggleCompare,
  onClick,
  viaCity
}: {
  job: BoardJob
  query: string
  branding: Branding
  adequacy: number | null
  applicants?: number
  active: boolean
  comparing: boolean
  onToggleCompare: () => void
  onClick: () => void
  viaCity?: string
}) {
  const salary = formatSalary(job)
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={`card group cursor-pointer p-5 transition-all hover:shadow-lift ${
        active ? 'ring-2' : ''
      }`}
      style={active ? ({ ['--tw-ring-color' as string]: branding.primary_color } as CSSProperties) : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[16.5px] font-semibold leading-snug tracking-[-0.015em] text-ink-950">
          <Highlight text={job.title} query={query} />
        </h3>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[11.5px] font-medium text-ink-400">
            {relativeDate(job.created_at)}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleCompare()
            }}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide transition-all"
            style={{
              borderColor: comparing ? 'var(--brand-500)' : 'var(--line)',
              backgroundColor: comparing ? 'var(--brand-soft-2)' : 'transparent',
              color: comparing ? 'var(--brand-700)' : 'var(--ink-400)'
            }}
          >
            <GitCompareArrows size={10} />
            {comparing ? 'comparando' : 'comparar'}
          </button>
        </div>
      </div>

      <p className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-700">
        <Building2 size={14} className="text-ink-400" />
        {job.company_name ?? 'Empresa credenciada'}
      </p>
      <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13.5px] text-ink-600">
        <MapPin size={14} className="text-ink-400" />
        {job.location ?? job.work_model ?? 'Brasil'}
        {viaCity ? (
          <span
            className="ml-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
          >
            {viaCity}
          </span>
        ) : null}
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
        {typeof applicants === 'number' && applicants > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <UserMultipleIcon size={14} className="text-ink-400" />
            {applicants} inscrito{applicants > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      {job.description ? (
        <p className="mt-2.5 line-clamp-2 text-[13.5px] leading-relaxed text-ink-500">
          {job.description}
        </p>
      ) : null}

      {adequacy !== null && adequacy > 0 ? (
        <div className="mt-3.5 flex items-center gap-2.5 border-t border-line pt-3">
          <span className="fit-bar">
            <span style={{ width: `${adequacy}%` }} />
          </span>
          <span className="text-[12px] font-semibold" style={{ color: 'var(--brand-700)' }}>
            Sua adequação: {adequacy}%
          </span>
          <Sparkles size={12} style={{ color: 'var(--brand-500)' }} />
        </div>
      ) : null}
    </motion.article>
  )
}

// ---------------------------------------------------------------------------
// Painel de detalhe da vaga
// ---------------------------------------------------------------------------

function JobDetailPanel({
  job,
  query,
  branding,
  stats,
  onClose,
  onToast
}: {
  job: BoardJob
  query: string
  branding: Branding
  stats?: JobStats
  onClose: () => void
  onToast: (message: string) => void
}) {
  const [detailTab, setDetailTab] = useState<'vaga' | 'requisitos' | 'beneficios'>('vaga')
  const panelRef = useRef<HTMLDivElement | null>(null)
  const salary = formatSalary(job)
  const adequacy = query.trim() ? scoreToAdequacy(rankJobs(query, [job])[0]?.score ?? 0) : null
  const terms = tokenize(query)

  useEffect(() => {
    setDetailTab('vaga')
  }, [job.id])

  return (
    <motion.div
      key={job.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="card print-area overflow-hidden"
      ref={panelRef}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[23px] font-bold leading-tight tracking-[-0.02em] text-ink-950">
              {job.title}
            </h2>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-ink-800">
              <Building2 size={15} className="text-ink-400" />
              {job.company_name ?? 'Empresa credenciada'}
              <span className="inline-flex" title="Empresa credenciada FLOW" style={{ color: branding.primary_color }}>
                <Tick02Icon size={15} />
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="no-print flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-400 transition-colors hover:text-ink-900"
            aria-label="Fechar detalhe"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 grid gap-1.5 text-[13.5px] text-ink-600">
          <p className="inline-flex items-center gap-1.5">
            <MapPin size={15} className="text-ink-400" /> {job.location ?? '—'}
            {job.work_model ? ` · ${job.work_model}` : ''}
          </p>
          {salary ? (
            <p className="inline-flex items-center gap-1.5 font-medium text-ink-700">
              <Banknote size={15} className="text-ink-400" /> {salary}
            </p>
          ) : null}
          <p className="inline-flex items-center gap-1.5">
            <Briefcase size={15} className="text-ink-400" />
            {EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type}
            {job.openings > 1 ? ` · ${job.openings} posições abertas` : ''}
          </p>
          <p className="inline-flex items-center gap-1.5 text-[13px] text-ink-500">
            <CalendarClock size={14} className="text-ink-400" /> Publicada{' '}
            {new Date(job.created_at).toLocaleDateString('pt-BR')} ({relativeDate(job.created_at)})
          </p>
          {stats && stats.applicants > 0 ? (
            <p className="inline-flex items-center gap-1.5 text-[13px] text-ink-500">
              <UserMultipleIcon size={14} className="text-ink-400" />
              {stats.applicants} pessoa{stats.applicants > 1 ? 's' : ''} já se candidataram
            </p>
          ) : null}
        </div>

        {adequacy !== null ? (
          <div
            className="mt-4 flex items-center gap-3 rounded-xl border px-3.5 py-2.5"
            style={{ borderColor: 'var(--brand-ring)', backgroundColor: 'var(--brand-soft)' }}
          >
            <Sparkles size={15} style={{ color: 'var(--brand-700)' }} />
            <div className="flex-1">
              <p className="text-[12.5px] font-semibold" style={{ color: 'var(--brand-800)' }}>
                Sua adequação a esta vaga: {adequacy}%
              </p>
              <p className="text-[11.5px] text-ink-500">
                {terms.length > 0
                  ? `Calculado com base em “${terms.join(' ')}” e no conteúdo da vaga.`
                  : 'Calculado com base no conteúdo da vaga.'}
              </p>
            </div>
          </div>
        ) : null}

        <div className="no-print mt-4 flex gap-2">
          <a
            href={jobApplyUrl(job.slug)}
            className="btn-primary-glow flex-1 rounded-xl py-3 text-center text-[14.5px] font-bold"
          >
            CANDIDATAR-ME
          </a>
          <button
            type="button"
            onClick={async () => {
              const result = await shareJob({
                title: `${job.title} — Recruta+`,
                text: `Vaga de ${job.title} em ${job.location ?? 'Brasil'}`,
                url: jobUrl(job.slug)
              })
              onToast(
                result === 'copied'
                  ? 'Link da vaga copiado!'
                  : result === 'shared'
                    ? 'Compartilhado!'
                    : 'Não foi possível compartilhar agora.'
              )
            }}
            className="flex size-11 items-center justify-center rounded-xl border border-line text-ink-500 transition-colors hover:text-ink-900"
            aria-label="Compartilhar vaga"
            title="Compartilhar"
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => printArea()}
            className="flex size-11 items-center justify-center rounded-xl border border-line text-ink-500 transition-colors hover:text-ink-900"
            aria-label="Imprimir vaga"
            title="Imprimir"
          >
            <Printer size={16} />
          </button>
        </div>

        <div className="mt-6 flex gap-1 border-b border-line">
          {([
            ['vaga', 'Vaga'],
            ['requisitos', 'Pré-requisitos'],
            ['beneficios', 'Benefícios']
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDetailTab(value)}
              className="relative px-3 pb-2.5 text-[12.5px] font-bold uppercase tracking-wide transition-colors"
              style={{
                color: detailTab === value ? branding.primary_color : 'var(--ink-400)'
              }}
            >
              {label}
              {detailTab === value ? (
                <motion.span
                  layoutId="job-detail-tab"
                  className="absolute inset-x-1 -bottom-px h-[2px] rounded-full"
                  style={{ backgroundColor: branding.primary_color }}
                />
              ) : null}
            </button>
          ))}
        </div>

        {detailTab === 'vaga' ? (
          job.description ? (
            <p className="prose-job mt-4 text-[14px] leading-relaxed text-ink-700">
              <Highlight text={job.description} query={query} />
            </p>
          ) : (
            <p className="mt-4 text-[13.5px] text-ink-400">
              A empresa não detalhou a descrição — candidate-se para saber mais.
            </p>
          )
        ) : null}

        {detailTab === 'requisitos' ? (
          job.requirements && job.requirements.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {job.requirements.map((item, index) => (
                <li key={index} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-600">
                  <Tick02Icon size={14} className="mt-0.5 shrink-0" style={{ color: branding.primary_color }} />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13.5px] text-ink-400">Nenhum pré-requisito informado.</p>
          )
        ) : null}

        {detailTab === 'beneficios' ? (
          job.benefits && job.benefits.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {job.benefits.map((item, index) => (
                <li key={index} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-600">
                  <Tick02Icon size={14} className="mt-0.5 shrink-0" style={{ color: branding.primary_color }} />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13.5px] text-ink-400">Nenhum benefício informado.</p>
          )
        ) : null}

        <div className="no-print mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
          <a
            href={jobUrl(job.slug)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-500 transition-colors hover:text-ink-900"
          >
            <ExternalLink size={13.5} /> Abrir página completa
          </a>
          <a
            href={jobPortalUrl(job.slug)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-400 transition-colors hover:text-ink-700"
          >
            <ArrowLeft size={13.5} /> Ver no portal da empresa
          </a>
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Aba EMPRESA
// ---------------------------------------------------------------------------

function CompanyTab({
  jobs,
  branding,
  onPick
}: {
  jobs: Array<{ job: BoardJob; score: number; adequacy: number }>
  branding: Branding
  onPick: (job: BoardJob) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, BoardJob[]>()
    for (const { job } of jobs) {
      const key = job.company_name ?? 'Empresa credenciada'
      map.set(key, [...(map.get(key) ?? []), job])
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [jobs])

  if (groups.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <Building2 size={26} className="text-ink-300" />
        <p className="mt-3 font-display text-[16px] font-semibold text-ink-800">
          Nenhuma empresa com vagas nesses filtros
        </p>
        <p className="mt-1 max-w-sm text-[13.5px] text-ink-500">
          Ajuste a busca ou os filtros para ver as empresas que estão contratando.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map(([company, list], index) => (
        <motion.div
          key={company}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: index * 0.05 }}
          className="card flex flex-col p-5"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl font-display text-[16px] font-bold"
              style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
            >
              {company.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-display text-[15.5px] font-semibold text-ink-950">
                {company}
              </h3>
              <p className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-500">
                <Tick02Icon size={12.5} style={{ color: branding.primary_color }} />
                Credenciada · {list.length} vaga{list.length > 1 ? 's' : ''} aberta
                {list.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5">
            {list.slice(0, 4).map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => onPick(job)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink-800">
                      {job.title}
                    </span>
                    <span className="block truncate text-[12px] text-ink-500">
                      {job.location ?? 'Brasil'}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold" style={{ color: branding.primary_color }}>
                    ver
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list.length > 4 ? (
            <p className="mt-2 px-3 text-[12px] text-ink-400">
              + {list.length - 4} outra{list.length - 4 > 1 ? 's' : ''} vaga
              {list.length - 4 > 1 ? 's' : ''} desta empresa
            </p>
          ) : null}
        </motion.div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba COMPARATIVO
// ---------------------------------------------------------------------------

function CompareTab({
  jobs,
  stats,
  branding,
  onRemove,
  onBackToSearch
}: {
  jobs: BoardJob[]
  stats: Record<string, JobStats>
  branding: Branding
  onRemove: (id: string) => void
  onBackToSearch: () => void
}) {
  if (jobs.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <GitCompareArrows size={26} className="text-ink-300" />
        <p className="mt-3 font-display text-[16px] font-semibold text-ink-800">
          Compare vagas lado a lado
        </p>
        <p className="mt-1 max-w-sm text-[13.5px] text-ink-500">
          Na aba VAGA, toque em “comparar” em até 3 vagas para ver salário, contrato, local e
          inscritos em uma tabela só.
        </p>
        <button type="button" onClick={onBackToSearch} className="btn-primary-glow mt-5 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold">
          Ver vagas
        </button>
      </div>
    )
  }

  const rows: Array<[string, (job: BoardJob) => string]> = [
    ['Salário', (job) => formatSalary(job) ?? 'Não informado'],
    ['Contrato', (job) => EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type],
    ['Modelo', (job) => job.work_model ?? '—'],
    ['Local', (job) => job.location ?? '—'],
    ['Publicada', (job) => relativeDate(job.created_at)],
    ['Posições', (job) => String(job.openings ?? 1)],
    ['Inscritos', (job) => String(stats[job.slug]?.applicants ?? 0)]
  ]

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
          <GitCompareArrows size={13} /> Comparando {jobs.length} vaga{jobs.length > 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onRemove(job.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-ink-600 transition-colors hover:text-ink-900"
            >
              {job.title} <X size={12} />
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className="w-[130px] border-b border-line px-4 py-3 text-left text-[12px] font-bold uppercase tracking-wide text-ink-400">
                Critério
              </th>
              {jobs.map((job) => (
                <th key={job.id} className="border-b border-line px-4 py-3 text-left">
                  <span className="block font-display text-[14px] font-semibold text-ink-950">
                    {job.title}
                  </span>
                  <span className="block text-[12px] font-normal text-ink-500">
                    {job.company_name ?? 'Empresa credenciada'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="odd:bg-surface-2/40">
                <td className="border-b border-line px-4 py-3 font-semibold text-ink-500">{label}</td>
                {jobs.map((job) => (
                  <td key={job.id} className="border-b border-line px-4 py-3 text-ink-700">
                    {value(job)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-4 py-4" />
              {jobs.map((job) => (
                <td key={job.id} className="px-4 py-4">
                  <a
                    href={jobApplyUrl(job.slug)}
                    className="btn-primary-glow inline-flex rounded-xl px-3.5 py-2 text-[12.5px] font-bold"
                  >
                    Candidatar-me
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-[12px] text-ink-400">
        Dica: a cor dos destaques segue a identidade visual configurada em{' '}
        <b className="font-semibold text-ink-600">{branding.footer_note}</b>.
      </p>
    </div>
  )
}
