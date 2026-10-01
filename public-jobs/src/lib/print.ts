/** Imprime só a área marcada com .print-area (a vaga aberta). */
export function printArea(): void {
  document.body.classList.add('printing')
  const cleanup = () => {
    document.body.classList.remove('printing')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.setTimeout(() => window.print(), 60)
}

/** Compartilha a vaga: Web Share nativo quando existir, senão copia o link. */
export async function shareJob(options: {
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
