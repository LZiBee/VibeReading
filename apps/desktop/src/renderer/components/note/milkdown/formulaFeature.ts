import katex from 'katex'
import type { Editor } from '@milkdown/kit/core'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $node, $view } from '@milkdown/utils'
import type { Ctx } from '@milkdown/kit/ctx'
import type { MarkdownNode, NodeSchema } from '@milkdown/kit/transformer'
import type { SourceRef } from '@thesis-agent/shared'
import { decodeComplexBlockHref, encodeComplexBlockHref } from './complexBlockProtocol'

export type FormulaAttrs = {
  blockId: string
  label: string
  pageNo?: number
  latex?: string
  sourceRefsJson?: string
}

export type FormulaLatexInput = {
  linkTitle?: string
  payloadText?: string
  sourceRefsJson?: string
  fallback?: string
}

type DefineFeature<Config = unknown> = (editor: Editor, config?: Config) => void

export const formulaNode = $node('formula', (_ctx: Ctx): NodeSchema => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    blockId: { default: '' },
    label: { default: '' },
    pageNo: { default: 1 },
    latex: { default: '' },
    sourceRefsJson: { default: '' }
  },
  parseMarkdown: {
    match: (node: MarkdownNode) =>
      node.type === 'paragraph' &&
      Array.isArray(node.children) &&
      node.children.length === 1 &&
      node.children[0]?.type === 'link' &&
      typeof node.children[0]?.url === 'string' &&
      node.children[0].url.startsWith('inspiration-note-block://') &&
      decodeComplexBlockHref(node.children[0].url)?.kind === 'formula',
    runner: (state, node, proseType) => {
      const link = node.children?.[0]
      const url = typeof link?.url === 'string' ? link.url : ''
      const payload = decodeComplexBlockHref(url)
      const label = readFormulaLabel(link)
      const linkTitle = readLinkTitle(link)
      const latex = readFormulaLatex({
        linkTitle,
        payloadText: payload?.text,
        sourceRefsJson: payload?.sourceRefsJson,
        fallback: label
      })
      const blockId = payload?.blockId ?? ''
      const pageNo = payload?.pageNo ?? 1
      const sourceRefsJson = payload?.sourceRefsJson ?? ''

      state.addNode(proseType, {
        blockId,
        label,
        pageNo,
        latex,
        sourceRefsJson
      })
    }
  },
  toMarkdown: {
    match: (node: ProseNode) => node.type.name === 'formula',
    runner: (state, node) => {
      const attrs = node.attrs as FormulaAttrs
      const label = attrs.label || '公式'
      const href = createFormulaHref(attrs)

      state.addNode('paragraph', [
        {
          type: 'link',
          url: href,
          children: [
            {
              type: 'text',
              value: label
            }
          ]
        }
      ])
    }
  }
}))

const formulaView = $view(formulaNode, (_ctx): NodeViewConstructor => {
  return (node) => {
    const dom = document.createElement('div')
    dom.className = 'milkdown-formula milkdown-formula-preview'
    dom.dataset.noteBlockId = String(node.attrs.blockId ?? '')
    dom.dataset.noteBlockType = 'formula'
    dom.title = '按住 Ctrl/Command 并左键可跳回 PDF 来源'

    const latex = String(node.attrs.latex ?? '').trim()
    if (latex) {
      dom.innerHTML = renderFormulaLatex(latex)
    } else {
      dom.classList.add('empty')
      dom.textContent = '空公式'
    }

    return {
      dom,
      ignoreMutation: () => true
    }
  }
})

export const formulaFeature: DefineFeature = (editor) => {
  editor.use(formulaNode)
  editor.use(formulaView)
}

export function createFormulaHref(attrs: FormulaAttrs): string {
  return encodeComplexBlockHref({
    blockId: attrs.blockId,
    kind: 'formula',
    pageNo: attrs.pageNo,
    sourceRefsJson: attrs.sourceRefsJson
  })
}

function renderFormulaLatex(latex: string): string {
  return katex.renderToString(normalizeFormulaLatex(latex), {
    throwOnError: false,
    displayMode: true,
    strict: 'ignore'
  })
}

export function readFormulaLatex({
  linkTitle,
  payloadText,
  sourceRefsJson,
  fallback = ''
}: FormulaLatexInput): string {
  if (payloadText?.trim()) {
    return normalizeFormulaLatex(payloadText)
  }

  const sourceRefQuote = readSourceRefQuote(sourceRefsJson)
  if (sourceRefQuote) {
    return normalizeFormulaLatex(sourceRefQuote)
  }

  if (linkTitle) {
    return normalizeFormulaLatex(restoreMarkdownLinkTitle(linkTitle))
  }

  return looksLikeLatex(fallback) ? normalizeFormulaLatex(fallback) : ''
}

export function normalizeFormulaLatex(value: string): string {
  const trimmed = value.replace(/\r\n/g, '\n').trim()

  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return normalizeLatexTokenStream(trimmed.slice(2, -2).trim())
  }

  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return normalizeLatexTokenStream(trimmed.slice(2, -2).trim())
  }

  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    return normalizeLatexTokenStream(trimmed.slice(2, -2).trim())
  }

  if (
    trimmed.startsWith('$') &&
    trimmed.endsWith('$') &&
    !trimmed.startsWith('$$') &&
    !trimmed.endsWith('$$') &&
    trimmed.length >= 2
  ) {
    return normalizeLatexTokenStream(trimmed.slice(1, -1).trim())
  }

  return normalizeLatexTokenStream(trimmed)
}

function normalizeLatexTokenStream(value: string): string {
  let next = value
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  for (let index = 0; index < 3; index += 1) {
    next = next
      .replace(/\\{2,}(?=[A-Za-z])/g, '\\')
      .replace(/\\{2,}\s*(\\[A-Za-z])/g, '$1')
      .replace(/\\\s+(\\[A-Za-z])/g, '$1')
  }

  return next
    .replace(/\s+([_^])/g, '$1')
    .replace(/([_^])\s+/g, '$1')
    .replace(/([_^])\{\s+/g, '$1{')
    .replace(/([_^])\s*\{\s*/g, '$1{')
    .replace(/(\\[A-Za-z]+)\s+\{/g, '$1{')
    .replace(/\{\s+/g, '{')
    .replace(/\s+\}/g, '}')
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .trim()
}

function readSourceRefQuote(sourceRefsJson: string | undefined): string {
  if (!sourceRefsJson) {
    return ''
  }

  try {
    const parsed = JSON.parse(sourceRefsJson) as SourceRef[]
    if (!Array.isArray(parsed)) {
      return ''
    }

    return parsed
      .map((sourceRef) => (typeof sourceRef.quote === 'string' ? sourceRef.quote.trim() : ''))
      .find((quote) => quote.length > 0) ?? ''
  } catch {
    return ''
  }
}

function restoreMarkdownLinkTitle(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/&quot;/g, '"')
}

function looksLikeLatex(value: string): boolean {
  return /\\[A-Za-z]+|[_^{}=]/.test(value)
}

function readFormulaLabel(link: unknown): string {
  const text = readLinkText(link).trim()
  return text || '公式'
}

function readLinkTitle(link: unknown): string | undefined {
  if (!link || typeof link !== 'object') {
    return undefined
  }

  const title = (link as { title?: unknown }).title
  return typeof title === 'string' ? title : undefined
}

function readLinkText(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return ''
  }

  if (typeof (node as { value?: unknown }).value === 'string') {
    return (node as { value: string }).value
  }

  const children = (node as { children?: unknown }).children
  if (!Array.isArray(children)) {
    return ''
  }

  return children.map((child) => readLinkText(child)).join('')
}
