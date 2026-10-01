import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Brand } from './ui/Brand'
import { ButtonPair } from './ui/ButtonPair'

const NAV = [
  { label: 'Vagas', href: '/search' },
  { label: 'Como funciona', href: '/#como-funciona' },
  { label: 'Empresas', href: '/#empresas' },
  { label: 'Dúvidas', href: '/#faq' }
]

/** Layout do Recruta+ — header com a NOSSA marca (sem logo de cliente:
 * a logo do cliente só aparece no portal dele em /digaspi). */
export function BoardLayout({
  branding,
  children,
  searchSlot,
}: {
  branding: { primary_color: string; secondary_color: string; footer_note: string }
  children: ReactNode
  searchSlot?: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* Faixa superior na cor da marca + busca */}
      <div className="relative w-full" style={{ backgroundColor: branding.primary_color }}>
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(42rem 12rem at 82% -40%, rgb(255 255 255 / 0.28), transparent 65%)'
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <a href="/" aria-label="Recruta+ — início" className="group">
              <Brand tone="light" />
            </a>
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
              {NAV.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <ButtonPair size="sm" className="hidden sm:inline-flex" />
          </div>
          {searchSlot ? <div className="mt-4">{searchSlot}</div> : null}
        </div>
      </div>

      <main className="flex-1">{children}</main>

      {/* Footer do produto */}
      <footer className="border-t border-line bg-surface/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <Brand />
              <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                O site de vagas do <b className="font-semibold text-ink-700">Flow Jobs</b> — o motor
                de contratação RH Inteligente. Vagas reais de empresas credenciadas, candidatura em
                minutos e acompanhamento até a contratação.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-[13.5px] sm:grid-cols-3">
              <div>
                <p className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  Candidatos
                </p>
                <ul className="mt-3 space-y-2 text-ink-600">
                  <li><a className="transition-colors hover:text-brand-700" href="/search">Buscar vagas</a></li>
                  <li><a className="transition-colors hover:text-brand-700" href="https://rh.flwdesk.com/digaspi/#/candidato">Área do candidato</a></li>
                  <li><a className="transition-colors hover:text-brand-700" href="/#como-funciona">Como funciona</a></li>
                </ul>
              </div>
              <div>
                <p className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  Empresas
                </p>
                <ul className="mt-3 space-y-2 text-ink-600">
                  <li><a className="transition-colors hover:text-brand-700" href="/#empresas">Quem confia no Recruta+</a></li>
                  <li><a className="transition-colors hover:text-brand-700" href="/#faq">Dúvidas frequentes</a></li>
                </ul>
              </div>
              <div>
                <p className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  Produto
                </p>
                <ul className="mt-3 space-y-2 text-ink-600">
                  <li>Flow Jobs · RH Inteligente</li>
                  <li className="inline-flex items-center gap-1.5 text-ink-400">
                    <Lock size={12} className="text-brand-600" /> Dados protegidos (LGPD)
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-line pt-5 text-[12.5px] text-ink-400 sm:flex-row">
            <p>© {new Date().getFullYear()} Recruta+ · Flowdesk Brasil®</p>
            <p className="font-medium">{branding.footer_note}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
