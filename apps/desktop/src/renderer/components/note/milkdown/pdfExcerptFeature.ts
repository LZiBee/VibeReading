import type { Editor } from '@milkdown/kit/core'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $node, $view } from '@milkdown/utils'
import type { Ctx } from '@milkdown/kit/ctx'
import type { MarkdownNode, NodeSchema } from '@milkdown/kit/transformer'
import type { SourceRef } from '@thesis-agent/shared'
import { decodeComplexBlockHref, encodeComplexBlockHref } from './complexBlockProtocol'

type PdfExcerptAttrs = {
  blockId: string
  label: string
  pageNo?: number
  quote?: string
  sourceRefsJson?: string
}

export type PdfExcerptFeatureConfig = {
  onSourceJump?: (blockId: string) => void
}

type DefineFeature<Config = unknown> = (editor: Editor, config?: Config) => void

const pdfExcerptNode = $node('pdf_excerpt', (_ctx: Ctx): NodeSchema => ({
  group: 'block',
  content: 'inline*',
  atom: false,
  selectable: true,
  draggable: false,
  attrs: {
    blockId: { default: '' },
    label: { default: '' },
    pageNo: { default: 1 },
    quote: { default: '' },
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
      decodeComplexBlockHref(node.children[0].url)?.kind === 'pdf_excerpt',
    runner: (state, node, proseType) => {
      const link = node.children?.[0]
      const url = typeof link?.url === 'string' ? link.url : ''
      const payload = decodeComplexBlockHref(url)
      const label = readPdfExcerptLabel(link)
      const quote = readPdfExcerptQuote(link, payload?.sourceRefsJson, label)
      const blockId = payload?.blockId ?? ''
      const pageNo = payload?.pageNo ?? 1
      const sourceRefsJson = payload?.sourceRefsJson ?? ''

      state.openNode(proseType, {
        blockId,
        label,
        pageNo,
        quote,
        sourceRefsJson
      })
      state.addText(quote || label)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (node: ProseNode) => node.type.name === 'pdf_excerpt',
    runner: (state, node) => {
      const attrs = node.attrs as PdfExcerptAttrs
      const quote = cleanPdfExcerptText(node.textContent?.trim() || attrs.quote || attrs.label || 'PDF 摘录')
      const href = createPdfExcerptHref(attrs)
      state.addNode('paragraph', [
        {
          type: 'link',
          url: href,
          title: quote,
          children: [
            {
              type: 'text',
              value: attrs.label || 'PDF 摘录'
            }
          ]
        }
      ])
    }
  }
}))

const pdfExcerptView = $view(pdfExcerptNode, (_ctx): NodeViewConstructor => {
  return (node) => {
    const dom = document.createElement('div')
    dom.className = 'milkdown-pdf-excerpt'
    dom.dataset.noteBlockId = String(node.attrs.blockId ?? '')
    dom.dataset.noteBlockType = 'pdf_excerpt'

    const header = document.createElement('div')
    header.className = 'milkdown-pdf-excerpt-header'
    header.textContent = node.attrs.pageNo ? `PDF 摘录 · 第 ${String(node.attrs.pageNo)} 页` : 'PDF 摘录'

    const body = document.createElement('div')
    body.className = 'milkdown-pdf-excerpt-body'
    const contentDOM = document.createElement('div')
    contentDOM.className = 'milkdown-pdf-excerpt-content'
    body.append(contentDOM)

    const footer = document.createElement('div')
    footer.className = 'milkdown-pdf-excerpt-footer'
    footer.textContent = '按住 Ctrl/Command 并左键可跳回 PDF 来源'

    dom.append(body)

    return {
      dom,
      contentDOM,
      ignoreMutation: () => true
    }
  }
})

export const pdfExcerptFeature: DefineFeature<PdfExcerptFeatureConfig> = (editor, config) => {
  editor.use(pdfExcerptNode)
  editor.use(pdfExcerptView)
  void config
}

function createPdfExcerptHref(attrs: PdfExcerptAttrs): string {
  return encodeComplexBlockHref({
    blockId: attrs.blockId,
    kind: 'pdf_excerpt',
    pageNo: attrs.pageNo,
    sourceRefsJson: attrs.sourceRefsJson
  })
}

function readPdfExcerptQuote(link: unknown, sourceRefsJson: string | undefined, fallback: string): string {
  const sourceRefQuote = readSourceRefQuote(sourceRefsJson)
  if (sourceRefQuote) {
    return cleanPdfExcerptText(sourceRefQuote)
  }

  if (link && typeof link === 'object' && typeof (link as { title?: unknown }).title === 'string') {
    return cleanPdfExcerptText(restoreMarkdownLinkTitle((link as { title: string }).title) || fallback)
  }

  return cleanPdfExcerptText(fallback)
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

function cleanPdfExcerptText(value: string): string {
  return stripMarkdownEmphasisFences(value)
}

function stripMarkdownEmphasisFences(value: string): string {
  let next = value

  for (let index = 0; index < 4; index += 1) {
    const stripped = next.replace(
      /(^|[\s([{"'“‘>])(\*{2,})(?=\S)([\s\S]*?\S)\2(?=$|[\s)\].,;:!?"'”’])/g,
      '$1$3'
    )

    if (stripped === next) {
      break
    }

    next = stripped
  }

  return next
    .replace(/(^|[\s([{"'“‘>])\*{2,}(?=\S)/g, '$1')
    .replace(/(?<=\S)\*{2,}(?=$|[\s)\].,;:!?"'”’])/g, '')
}

function readPdfExcerptLabel(link: unknown): string {
  if (!link || typeof link !== 'object') {
    return 'PDF 摘录'
  }

  const maybeChildren = (link as { children?: Array<{ value?: unknown }> }).children
  const text = maybeChildren?.map((child) => (typeof child.value === 'string' ? child.value : '')).join('').trim()
  return text || 'PDF 摘录'
}
