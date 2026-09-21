import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { ConfettiBurst } from '@/components/confetti-burst'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import {
  formatCpf,
  formatPhone,
  isValidCpf,
  isValidPhone,
  onlyCpfDigits,
  SORTEIO_VALE_TYPES,
  type SorteioClient,
  type SorteioConfirmResult,
  type SorteioValeTypeId
} from '../../../shared/sorteio'

export type SorteioStep = 'cpf' | 'cadastro' | 'vale' | 'confirm'

type SorteioFlowProps = {
  storeId: string
  /** Quando true, o título fica só no Dialog/pai. */
  embedded?: boolean
  onStepChange?: (step: SorteioStep, existing: SorteioClient | null, isNewClient: boolean) => void
  onFinished?: () => void
}

export function SorteioFlow({ storeId, embedded = false, onStepChange, onFinished }: SorteioFlowProps) {
  const [step, setStep] = useState<SorteioStep>('cpf')
  const [cpf, setCpf] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [existing, setExisting] = useState<SorteioClient | null>(null)
  const [valeType, setValeType] = useState<SorteioValeTypeId | null>(null)
  const [valeOther, setValeOther] = useState('')
  const [result, setResult] = useState<SorteioConfirmResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onStepChangeRef = useRef(onStepChange)
  onStepChangeRef.current = onStepChange

  useEffect(() => {
    onStepChangeRef.current?.(step, existing, Boolean(result?.isNewClient))
  }, [step, existing, result])

  async function goFromCpf(): Promise<void> {
    if (busy) return
    setError(null)
    const digits = onlyCpfDigits(cpf)
    if (!isValidCpf(digits)) {
      setError('Informe um CPF válido.')
      return
    }
    setBusy(true)
    try {
      const lookup = await operations().lookupSorteioClient(digits, storeId)
      if (lookup.found && lookup.client) {
        setExisting(lookup.client)
        setName(lookup.client.name)
        setPhone(lookup.client.phoneFormatted)
        setStep('vale')
      } else {
        setExisting(null)
        setStep('cadastro')
      }
    } catch (err) {
      setError(operationError(err))
    } finally {
      setBusy(false)
    }
  }

  function goFromCadastro(): void {
    setError(null)
    if (name.trim().length < 2) {
      setError('Informe o nome completo.')
      return
    }
    if (!isValidPhone(phone)) {
      setError('Informe um telefone válido com DDD.')
      return
    }
    setStep('vale')
  }

  async function submitVale(): Promise<void> {
    if (busy || !valeType) return
    setError(null)
    if (valeType === 'OUTRO' && valeOther.trim().length < 2) {
      setError('Descreva o tipo de vale.')
      return
    }
    setBusy(true)
    try {
      const base = {
        storeId,
        cpf: onlyCpfDigits(cpf),
        valeType,
        valeLabel: valeType === 'OUTRO' ? valeOther.trim() : null
      }
      const next = existing
        ? await operations().addSorteioVale(base)
        : await operations().registerSorteioClient({
            ...base,
            name: name.trim(),
            phone
          })
      setResult(next)
      setStep('confirm')
      onFinished?.()
    } catch (err) {
      setError(operationError(err))
    } finally {
      setBusy(false)
    }
  }

  function resetFlow(): void {
    setStep('cpf')
    setCpf('')
    setName('')
    setPhone('')
    setExisting(null)
    setValeType(null)
    setValeOther('')
    setResult(null)
    setError(null)
  }

  return (
    <div className={cn('relative', embedded && 'px-5 pb-5')}>
      {step === 'confirm' && result?.isNewClient ? <ConfettiBurst active /> : null}

      {!embedded ? (
        <header className="mb-5">
          <StepHeading step={step} existing={existing} result={result} />
        </header>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-[10px] border border-red-500/15 bg-red-500/8 px-3 py-2.5 text-[12.5px] text-red-300/85">
          {error}
        </div>
      ) : null}

      {step === 'cpf' ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">CPF do cliente</Label>
            <Input
              value={cpf}
              inputMode="numeric"
              autoFocus
              placeholder="000.000.000-00"
              onChange={(event) => setCpf(formatCpf(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void goFromCpf()
              }}
              className="h-11 w-full max-w-full rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[15px]"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void goFromCpf()}
              className="h-10 rounded-[10px] bg-[#F0EFEC] px-5 text-[13px] text-[#111111] disabled:opacity-50"
            >
              {busy ? 'Verificando…' : 'Próximo'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'cadastro' ? (
        <div className="space-y-3.5">
          <Field label="Nome">
            <Input
              value={name}
              autoFocus
              placeholder="Nome completo"
              onChange={(event) => setName(event.target.value)}
              className="h-11 w-full max-w-full rounded-[10px] border-white/[0.08] bg-white/[0.03]"
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={phone}
              inputMode="tel"
              placeholder="(00) 00000-0000"
              onChange={(event) => setPhone(formatPhone(event.target.value))}
              className="h-11 w-full max-w-full rounded-[10px] border-white/[0.08] bg-white/[0.03]"
            />
          </Field>
          <Field label="CPF">
            <Input
              value={cpf}
              readOnly
              className="h-11 w-full max-w-full rounded-[10px] border-white/[0.08] bg-white/[0.02] text-[#F0EFEC]/55"
            />
          </Field>
          <FooterNav onBack={() => setStep('cpf')} onNext={goFromCadastro} nextLabel="Próximo" />
        </div>
      ) : null}

      {step === 'vale' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            {SORTEIO_VALE_TYPES.map((item) => {
              const selected = valeType === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setValeType(item.id)}
                  className={cn(
                    'flex w-full flex-col rounded-[12px] border px-3.5 py-3 text-left transition-colors',
                    selected
                      ? 'border-[#F0EFEC]/28 bg-[#F0EFEC]/08'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                  )}
                >
                  <span className="text-[13.5px] text-[#F0EFEC]/88">{item.label}</span>
                  <span className="mt-0.5 text-[12px] text-[#F0EFEC]/38">{item.description}</span>
                </button>
              )
            })}
          </div>
          {valeType === 'OUTRO' ? (
            <Input
              value={valeOther}
              autoFocus
              placeholder="Descreva o vale"
              onChange={(event) => setValeOther(event.target.value)}
              className="h-11 w-full max-w-full rounded-[10px] border-white/[0.08] bg-white/[0.03]"
            />
          ) : null}
          <FooterNav
            onBack={() => setStep(existing ? 'cpf' : 'cadastro')}
            onNext={() => void submitVale()}
            nextLabel={busy ? 'Salvando…' : 'Confirmar'}
            nextDisabled={busy || !valeType}
          />
        </div>
      ) : null}

      {step === 'confirm' && result ? (
        <div className="relative space-y-4 pt-1">
          <div className="flex flex-col items-center rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-4 py-6 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-[#7DD3A7]/15 text-[#7DD3A7]">
              <Check className="size-5" strokeWidth={2.2} />
            </div>
            <p className="text-[15px] text-[#F0EFEC]/90">{result.client.name}</p>
            <p className="mt-1 text-[12.5px] text-[#F0EFEC]/40">
              {result.client.cpfFormatted} · {result.client.phoneFormatted}
            </p>
            <p className="mt-4 text-[28px] font-medium tracking-tight text-[#F0EFEC]">
              {result.client.chances}
              <span className="ml-2 text-[14px] font-normal text-[#F0EFEC]/45">
                {result.client.chances === 1 ? 'vale / chance' : 'vales / chances'}
              </span>
            </p>
            <p className="mt-2 text-[12.5px] text-[#F0EFEC]/38">
              {result.isNewClient ? 'Primeiro cadastro · ' : '+1 · '}
              {result.vale.valeLabel}
            </p>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetFlow}
              className="h-10 rounded-[10px] bg-[#F0EFEC] px-5 text-[13px] text-[#111111]"
            >
              Novo registro
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StepHeading({
  step,
  existing,
  result
}: {
  step: SorteioStep
  existing: SorteioClient | null
  result: SorteioConfirmResult | null
}) {
  if (step === 'cpf') {
    return (
      <>
        <h2 className="text-[20px] text-[#F0EFEC]/90">Sorteio</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#F0EFEC]/40">
          Digite o CPF do cliente para somar um vale ou iniciar o cadastro.
        </p>
      </>
    )
  }
  if (step === 'cadastro') {
    return (
      <>
        <h2 className="text-[20px] text-[#F0EFEC]/90">Cadastro</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#F0EFEC]/40">
          Primeira vez deste CPF. Preencha os dados do cliente.
        </p>
      </>
    )
  }
  if (step === 'vale') {
    return (
      <>
        <h2 className="text-[20px] text-[#F0EFEC]/90">Qual tipo de vale?</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#F0EFEC]/40">
          {existing
            ? `${existing.name} já tem ${existing.chances} ${existing.chances === 1 ? 'vale' : 'vales'}.`
            : 'Escolha a regra que liberou este vale.'}
        </p>
      </>
    )
  }
  return (
    <>
      <h2 className="text-[20px] text-[#F0EFEC]/90">
        {result?.isNewClient ? 'Cadastro confirmado' : 'Vale confirmado'}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[#F0EFEC]/40">
        {result
          ? `${result.client.name} agora tem ${result.client.chances} ${result.client.chances === 1 ? 'chance' : 'chances'}.`
          : ''}
      </p>
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-[#F0EFEC]/45">{label}</Label>
      {children}
    </div>
  )
}

function FooterNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled
}: {
  onBack: () => void
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="h-10 rounded-[10px] px-4 text-[13px] text-[#F0EFEC]/45 hover:text-[#F0EFEC]/70"
      >
        Voltar
      </button>
      <button
        type="button"
        disabled={nextDisabled}
        onClick={onNext}
        className="h-10 rounded-[10px] bg-[#F0EFEC] px-5 text-[13px] text-[#111111] disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  )
}

export function sorteioDialogTitle(
  step: SorteioStep,
  existing: SorteioClient | null,
  isNewClient: boolean
): { title: string; description: string } {
  if (step === 'cpf') {
    return {
      title: 'Cadastrar no sorteio',
      description: 'Digite o CPF do cliente para localizar ou criar o cadastro.'
    }
  }
  if (step === 'cadastro') {
    return { title: 'Cadastro', description: 'Primeira vez deste CPF. Preencha os dados.' }
  }
  if (step === 'vale') {
    return {
      title: 'Qual tipo de vale?',
      description: existing
        ? `${existing.name} já tem ${existing.chances} ${existing.chances === 1 ? 'vale' : 'vales'}.`
        : 'Escolha a regra que liberou este vale.'
    }
  }
  return {
    title: isNewClient ? 'Cadastro confirmado' : 'Vale confirmado',
    description: 'Mostre ao cliente quantas chances ele tem agora.'
  }
}
