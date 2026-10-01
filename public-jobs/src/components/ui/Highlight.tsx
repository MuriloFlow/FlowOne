import { Fragment } from 'react'
import { expandTerm, normalize, tokenize, wordSimilarity } from '../../lib/fuzzy'

/** Destaca no texto as palavras que bateram com a busca — inclusive por
 * semelhança ou sinônimo ("vendas" acende "Vendedor", "vendendor" acende
 * "Vendedor"). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const base = tokenize(query)
  if (base.length === 0) return <>{text}</>
  const seen = new Set(base)
  const terms = new Set<string>(base)
  for (const term of base) {
    for (const variant of expandTerm(term)) {
      if (!seen.has(variant)) {
        seen.add(variant)
        terms.add(variant)
      }
    }
  }
  const words = text.split(/(\s+)/)
  return (
    <>
      {words.map((word, index) => {
        const clean = normalize(word)
        if (!clean) return <Fragment key={index}>{word}</Fragment>
        const hit = [...terms].some(
          (term) => clean === term || clean.startsWith(term) || wordSimilarity(term, clean) >= 0.82
        )
        return hit ? (
          <mark key={index} className="hl">
            {word}
          </mark>
        ) : (
          <Fragment key={index}>{word}</Fragment>
        )
      })}
    </>
  )
}
