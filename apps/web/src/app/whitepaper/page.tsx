import fs from 'node:fs/promises'
import path from 'node:path'
import type { Metadata } from 'next'
import Link from 'next/link'
import { API_BASE } from '@/lib/api'

export const metadata: Metadata = {
  title: 'Whitepaper | Malama Labs',
  description: 'MLMA and Malama Genesis whitepaper.',
}

const WHITEPAPER_FILE = 'WHITEPAPER_v2.0.md'

async function loadWhitepaper() {
  const filePath = path.join(process.cwd(), 'public', 'docs', WHITEPAPER_FILE)
  return fs.readFile(filePath, 'utf8')
}

function markdownToBlocks(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const blocks: Array<{ type: 'h1' | 'h2' | 'h3' | 'li' | 'p' | 'rule' | 'code'; text: string }> = []
  let inCode = false

  for (const raw of lines) {
    const line = raw.trimEnd()
    const text = line.trim()

    if (text.startsWith('```')) {
      inCode = !inCode
      continue
    }
    if (inCode) {
      blocks.push({ type: 'code', text: line })
      continue
    }
    if (!text) continue
    if (/^-{3,}$/.test(text)) {
      blocks.push({ type: 'rule', text: '' })
      continue
    }
    if (text.startsWith('# ')) blocks.push({ type: 'h1', text: text.slice(2).trim() })
    else if (text.startsWith('## ')) blocks.push({ type: 'h2', text: text.slice(3).trim() })
    else if (text.startsWith('### ')) blocks.push({ type: 'h3', text: text.slice(4).trim() })
    else if (text.startsWith('- ') || text.startsWith('* ')) blocks.push({ type: 'li', text: text.slice(2).trim() })
    else blocks.push({ type: 'p', text })
  }

  return blocks
}

export default async function WhitepaperPage() {
  let markdown = ''
  let loadError = ''

  try {
    markdown = await loadWhitepaper()
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Whitepaper file could not be loaded.'
  }

  const blocks = markdownToBlocks(markdown)
  const apiDocUrl = `${API_BASE}/docs/${WHITEPAPER_FILE}`

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-malama-bg px-5 py-12 text-malama-ink sm:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-malama-line pb-6">
          <div>
            <Link href="/docs" className="font-mono text-[11px] uppercase tracking-[0.12em] text-malama-accent hover:text-malama-accent/80">
              Docs
            </Link>
            <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-white sm:text-5xl">
              Whitepaper
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/docs/${WHITEPAPER_FILE}`}
              className="rounded-malama-sm border border-malama-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-malama-ink-dim hover:border-malama-accent hover:text-malama-accent"
            >
              Markdown
            </a>
            <a
              href={apiDocUrl}
              className="rounded-malama-sm bg-malama-accent px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-malama-bg hover:shadow-[0_8px_24px_rgba(196,240,97,0.18)]"
            >
              API Copy
            </a>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-malama border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
            Could not load <code className="font-mono">{WHITEPAPER_FILE}</code>: {loadError}
          </div>
        ) : (
          <article className="space-y-4 rounded-malama border border-malama-line bg-malama-card/50 p-6 sm:p-8">
            {blocks.map((block, index) => {
              if (block.type === 'h1') {
                return <h2 key={index} className="pt-2 font-serif text-3xl font-medium text-white">{block.text}</h2>
              }
              if (block.type === 'h2') {
                return <h3 key={index} className="pt-6 font-serif text-2xl font-medium text-white">{block.text}</h3>
              }
              if (block.type === 'h3') {
                return <h4 key={index} className="pt-4 text-lg font-bold text-white">{block.text}</h4>
              }
              if (block.type === 'li') {
                return <p key={index} className="pl-4 text-sm leading-7 text-malama-ink-dim before:mr-2 before:text-malama-accent before:content-['-']">{block.text}</p>
              }
              if (block.type === 'rule') {
                return <hr key={index} className="my-8 border-malama-line" />
              }
              if (block.type === 'code') {
                return <pre key={index} className="overflow-x-auto rounded-malama-sm bg-black/30 p-3 font-mono text-xs text-malama-ink-dim">{block.text}</pre>
              }
              return <p key={index} className="text-sm leading-7 text-malama-ink-dim">{block.text}</p>
            })}
          </article>
        )}
      </div>
    </main>
  )
}
