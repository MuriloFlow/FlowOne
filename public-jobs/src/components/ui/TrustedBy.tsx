import { Building2, ShieldCheck } from 'lucide-react'

/** "Empresas que confiam no Recruta+" — marquee contínuo com as empresas
 * credenciadas + card convite ("sua empresa aqui"). */
export function TrustedBy({ companies, className = '' }: { companies: string[]; className?: string }) {
  const list = companies.length > 0 ? companies : ['Empresas credenciadas']
  // Repete para o loop ficar contínuo sem "buracos".
  const loop = [...list, ...list, ...list, ...list, ...list, ...list]

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="marquee-mask relative overflow-hidden py-1">
        <div className="marquee flex w-max items-center gap-3">
          {loop.map((company, index) => (
            <span
              key={`${company}-${index}`}
              className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-line bg-surface px-5 py-3 shadow-soft"
            >
              <span
                className="flex size-8 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--brand-soft-2)', color: 'var(--brand-700)' }}
              >
                <Building2 size={15} />
              </span>
              <span className="font-display text-[14.5px] font-semibold tracking-[-0.01em] text-ink-800">
                {company}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-500">
                <ShieldCheck size={11} className="text-brand-600" /> verificada
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
