import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import type { INode } from 'markmap-common'
import type { PaperMindmapDocument } from '../../app/types'

export type MindmapNodeJumpTarget = {
  paperPath: string
  pageNo: number
  label: string
}

type MarkmapMindmapViewerProps = {
  mindmap?: PaperMindmapDocument
  paperTitle: string
  isActive: boolean
  isGenerating: boolean
  warnings: string[]
  onOpenPdf: () => void
  onGenerate: () => void
  onNodeJump: (target: MindmapNodeJumpTarget) => void
}

const transformer = new Transformer()

export function MarkmapMindmapViewer({
  mindmap,
  paperTitle,
  isActive,
  isGenerating,
  warnings,
  onOpenPdf,
  onGenerate,
  onNodeJump
}: MarkmapMindmapViewerProps): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const markmapRef = useRef<ReturnType<typeof Markmap.create> | null>(null)
  const markdown = mindmap?.markdown.trim() ?? ''
  const fallbackLines = useMemo(() => markdown.split('\n').filter((line) => /^#{1,6}\s+/.test(line)), [markdown])

  useEffect(() => {
    return () => {
      markmapRef.current?.destroy()
      markmapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!svgRef.current || !markdown || !isActive) {
      return
    }

    const { root } = transformer.transform(markdown)
    if (!markmapRef.current) {
      markmapRef.current = Markmap.create(svgRef.current, {
        autoFit: true,
        duration: 260,
        maxWidth: 320,
        paddingX: 16
      }, root)
      return
    }

    markmapRef.current.setData(root)
    void markmapRef.current.fit()
  }, [isActive, markdown])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !mindmap) {
      return
    }

    const handleMindmapClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const foreignObject = target.closest<SVGForeignObjectElement>('foreignObject.markmap-foreign')
      const nodeGroup = target.closest<SVGGElement>('g.markmap-node')
      if (!foreignObject || !nodeGroup || !svg.contains(nodeGroup)) {
        return
      }

      const node = getBoundMarkmapNode(nodeGroup)
      const label = getMindmapNodeText(node, foreignObject)
      const pageNo = parseMindmapNodePageNo(label)
      if (!pageNo) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      onNodeJump({
        paperPath: mindmap.paperPath,
        pageNo,
        label: removeMindmapPageRefs(label)
      })
    }

    svg.addEventListener('click', handleMindmapClick)
    return () => svg.removeEventListener('click', handleMindmapClick)
  }, [mindmap, onNodeJump])

  if (!mindmap) {
    return (
      <div className="editor-surface mindmap-surface empty">
        <span className="codicon codicon-type-hierarchy-sub" aria-hidden="true" />
        <strong>{paperTitle || '论文脑图'}</strong>
        <small>需要先用 MinerU 解析 PDF，再基于解析结果生成 markmap 脑图。</small>
        <div className="mindmap-empty-actions">
          <button className="secondary-button compact" type="button" onClick={onOpenPdf}>
            <span className="codicon codicon-file-pdf" aria-hidden="true" />
            <span>回到 PDF</span>
          </button>
          <button className="primary-button compact" type="button" disabled={isGenerating} onClick={onGenerate}>
            <span className="codicon codicon-sparkle" aria-hidden="true" />
            <span>{isGenerating ? '生成中...' : '生成脑图'}</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-surface mindmap-surface">
      <div className="mindmap-toolbar">
        <div>
          <span className="codicon codicon-type-hierarchy-sub" aria-hidden="true" />
          <strong>论文脑图</strong>
          <small title={mindmap.paperPath}>{mindmap.paperTitle || paperTitle}</small>
        </div>
        <div className="mindmap-toolbar-actions">
          <span>{mindmap.nodeCount} 个节点</span>
          <button className="secondary-button compact" type="button" onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? '生成中...' : '重新生成'}
          </button>
        </div>
      </div>
      {warnings.length > 0 ? (
        <div className="mindmap-warning-strip">
          <span className="codicon codicon-warning" aria-hidden="true" />
          <span>{warnings.slice(0, 2).join('；')}</span>
        </div>
      ) : null}
      <div className="mindmap-canvas-shell">
        <svg ref={svgRef} className="mindmap-svg" role="img" aria-label="论文脑图" />
        <details className="mindmap-markdown-fallback">
          <summary>查看 Markdown 源文</summary>
          <pre>{fallbackLines.join('\n') || mindmap.markdown}</pre>
        </details>
      </div>
    </div>
  )
}

function getBoundMarkmapNode(element: SVGElement): INode | null {
  const maybeNode = (element as SVGElement & { __data__?: unknown }).__data__
  return isMarkmapNode(maybeNode) ? maybeNode : null
}

function isMarkmapNode(value: unknown): value is INode {
  return Boolean(value && typeof value === 'object' && 'content' in value && 'state' in value)
}

function getMindmapNodeText(node: INode | null, foreignObject: SVGForeignObjectElement): string {
  const source = node?.content || foreignObject.textContent || ''
  return source
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMindmapNodePageNo(label: string): number | null {
  const matches = [
    /\bp\.?\s*(\d{1,5})\b/i,
    /第\s*(\d{1,5})\s*页/,
    /页码\s*(\d{1,5})/
  ]

  for (const pattern of matches) {
    const match = pattern.exec(label)
    const pageNo = Number.parseInt(match?.[1] ?? '', 10)
    if (Number.isFinite(pageNo) && pageNo > 0) {
      return pageNo
    }
  }

  return null
}

function removeMindmapPageRefs(label: string): string {
  return label
    .replace(/\[[^\]]*\bp\.?\s*\d{1,5}[^\]]*\]/gi, '')
    .replace(/\[[^\]]*第\s*\d{1,5}\s*页[^\]]*\]/g, '')
    .replace(/（[^）]*第\s*\d{1,5}\s*页[^）]*）/g, '')
    .replace(/\([^)]*\bp\.?\s*\d{1,5}[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}
