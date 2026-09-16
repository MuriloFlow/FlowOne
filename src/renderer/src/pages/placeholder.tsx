type PlaceholderPageProps = {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
      <h1 className="text-[18px] text-[#F0EFEC]/78">{title}</h1>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[#F0EFEC]/36">
        Este módulo entra na próxima etapa. A Visão Geral e os Funcionários já usam os dados reais do Card+.
      </p>
    </div>
  )
}
