/** Compartilhar (Web Share → fallback copiar) e imprimir só a vaga. */
export async function sharePage(options: {
  title: string
  text?: string
  url: string
}): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title: options.title, text: options.text, url: options.url })
      return 'shared'
    }
  } catch {
    /* usuário cancelou ou não suportado — tenta copiar */
  }
  try {
    await navigator.clipboard.writeText(options.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function printPage(): void {
  window.setTimeout(() => window.print(), 60)
}
