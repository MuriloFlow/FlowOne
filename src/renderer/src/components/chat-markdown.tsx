import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ChatMarkdownProps = {
  text: string
  streaming?: boolean
  className?: string
}

export function ChatMarkdown({ text, streaming = false, className }: ChatMarkdownProps) {
  return (
    <div className={cn('kobbi-md select-text', className)}>
      {renderBlocks(text)}
      {streaming ? <span className="kobbi-caret" aria-hidden="true" /> : null}
    </div>
  )
}

function renderBlocks(text: string): ReactNode {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.trim() === '') {
      index += 1
      continue
    }

    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test((lines[index] ?? '').trim())) {
        code.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      nodes.push(
        <pre key={`code-${nodes.length}`} className="kobbi-md-pre">
          {lang ? <span className="kobbi-md-lang">{lang}</span> : null}
          <code>{code.join('\n')}</code>
        </pre>
      )
      continue
    }

    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={`hr-${nodes.length}`} className="kobbi-md-hr" />)
      index += 1
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const Tag = (level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5') as 'h3' | 'h4' | 'h5'
      nodes.push(
        <Tag key={`h-${nodes.length}`} className={cn('kobbi-md-heading', `kobbi-md-h${level}`)}>
          {renderInline(heading[2])}
        </Tag>
      )
      index += 1
      continue
    }

    if (/^-#\s+/.test(line)) {
      nodes.push(
        <p key={`sub-${nodes.length}`} className="kobbi-md-sub">
          {renderInline(line.replace(/^-#\s+/, ''))}
        </p>
      )
      index += 1
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\d+\.\s+/, ''))
        index += 1
      }
      nodes.push(
        <ol key={`ol-${nodes.length}`} className="kobbi-md-ol">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^[-*]\s+/, ''))
        index += 1
      }
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="kobbi-md-ul">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() !== '' &&
      !/^(#{1,3}\s+|```|-#\s+|\d+\.\s+|[-*]\s+|---+$)/.test(lines[index] ?? '')
    ) {
      paragraph.push(lines[index] ?? '')
      index += 1
    }
    nodes.push(
      <p key={`p-${nodes.length}`} className="kobbi-md-p">
        {renderInline(paragraph.join(' '))}
      </p>
    )
  }

  return nodes
}

function renderInline(text: string): ReactNode[] {
  const pattern =
    /\|\|([\s\S]+?)\|\||`([^`]+)`|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*]+)\*|_([^_]+)_|~~([\s\S]+?)~~/g
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    if (match[1] != null) nodes.push(<Spoiler key={`s-${key++}`}>{renderInline(match[1])}</Spoiler>)
    else if (match[2] != null) nodes.push(<code key={`c-${key++}`} className="kobbi-md-code">{match[2]}</code>)
    else if (match[3] != null) nodes.push(<strong key={`b-${key++}`}>{renderInline(match[3])}</strong>)
    else if (match[4] != null) nodes.push(<strong key={`b-${key++}`}>{renderInline(match[4])}</strong>)
    else if (match[5] != null) nodes.push(<em key={`i-${key++}`}>{renderInline(match[5])}</em>)
    else if (match[6] != null) nodes.push(<em key={`i-${key++}`}>{renderInline(match[6])}</em>)
    else if (match[7] != null) nodes.push(<s key={`d-${key++}`}>{renderInline(match[7])}</s>)
    last = match.index + match[0].length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      className={cn('kobbi-md-spoiler', open && 'is-open')}
    >
      {children}
    </button>
  )
}
