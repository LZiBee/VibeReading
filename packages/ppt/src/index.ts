import pptxgen from 'pptxgenjs'
import type {
  DeckSpec,
  PptAuditIssue,
  PptExportResult,
  PptThemeConfig,
  SlideAssetRef,
  SlideElementSpec,
  SlideSpec
} from '@thesis-agent/shared'

export type PptAssetResolver = (asset: SlideAssetRef) => Promise<string | undefined> | string | undefined

export type ExportDeckToPptxInput = {
  deck: DeckSpec
  outputPath: string
  theme?: Partial<PptThemeConfig>
  resolveAsset?: PptAssetResolver
}

type RenderContext = {
  pptx: pptxgen
  deck: DeckSpec
  assets: Map<string, SlideAssetRef>
  theme: PptThemeConfig
  auditIssues: PptAuditIssue[]
  resolveAsset?: PptAssetResolver
}

type SlideLayout = {
  x: number
  y: number
  w: number
  h: number
}

const SLIDE_WIDTH = 13.333
const SLIDE_HEIGHT = 7.5
const MARGIN_X = 0.68
const MARGIN_TOP = 0.45
const CONTENT_TOP = 1.35
const CONTENT_HEIGHT = 5.45

export const defaultPptTheme: PptThemeConfig = {
  id: 'academic-clean',
  name: '学术简报',
  fonts: {
    heading: 'Microsoft YaHei',
    body: 'Microsoft YaHei',
    code: 'Consolas'
  },
  colors: {
    background: 'F7F6F1',
    surface: 'FFFFFF',
    textPrimary: '222222',
    textSecondary: '67645F',
    accent: '2B5C8A',
    muted: 'D8D2C8',
    warning: 'B36B00'
  }
}

export function auditDeckSpec(deck: DeckSpec): PptAuditIssue[] {
  const issues: PptAuditIssue[] = []
  const assetIds = new Set(deck.assets.map((asset) => asset.id))

  if (deck.slides.length === 0) {
    issues.push(createAuditIssue('error', 'empty-deck', '演示文稿没有任何幻灯片。'))
  }

  deck.slides.forEach((slide, slideIndex) => {
    const slideNo = slideIndex + 1
    if (slide.title.trim().length > 42) {
      issues.push(createAuditIssue('warning', 'title-too-long', `第 ${slideNo} 页标题较长，可能影响版式。`, slide.id))
    }

    if (!isTransitionSlide(slide) && slide.sourceRefs.length === 0) {
      issues.push(createAuditIssue('warning', 'missing-source', `第 ${slideNo} 页缺少来源引用。`, slide.id))
    }

    slide.elements.forEach((element, elementIndex) => {
      if (element.type === 'bullet-list' && element.items.length > 5) {
        issues.push(
          createAuditIssue(
            'warning',
            'too-many-bullets',
            `第 ${slideNo} 页第 ${elementIndex + 1} 个要点列表超过 5 条，建议压缩或拆页。`,
            slide.id
          )
        )
      }

      if (element.type === 'image' && !assetIds.has(element.assetId)) {
        issues.push(
          createAuditIssue(
            'error',
            'missing-asset',
            `第 ${slideNo} 页引用了不存在的图片资产：${element.assetId}`,
            slide.id,
            element.assetId
          )
        )
      }

      if (element.type === 'table' && (element.columns.length > 5 || element.rows.length > 8)) {
        issues.push(
          createAuditIssue(
            'warning',
            'table-too-large',
            `第 ${slideNo} 页表格较大，可能需要拆分或改写为要点。`,
            slide.id
          )
        )
      }
    })
  })

  return issues
}

export async function exportDeckToPptx(input: ExportDeckToPptxInput): Promise<PptExportResult> {
  const auditIssues = auditDeckSpec(input.deck)
  if (auditIssues.some((issue) => issue.severity === 'error')) {
    return {
      ok: false,
      outputPath: input.outputPath,
      slideCount: input.deck.slides.length,
      auditIssues,
      errorCode: 'AUDIT_FAILED',
      message: 'PPT 导出前审计未通过。'
    }
  }

  const theme = mergeTheme(input.theme)
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Inspiration'
  pptx.company = 'Inspiration'
  pptx.subject = input.deck.subtitle ?? input.deck.title
  pptx.title = input.deck.title
  pptx.theme = {
    headFontFace: theme.fonts.heading,
    bodyFontFace: theme.fonts.body
  }

  const context: RenderContext = {
    pptx,
    deck: input.deck,
    assets: new Map(input.deck.assets.map((asset) => [asset.id, asset])),
    theme,
    auditIssues,
    resolveAsset: input.resolveAsset
  }

  for (const slide of input.deck.slides) {
    await renderSlide(context, slide)
  }

  await pptx.writeFile({ fileName: input.outputPath })

  return {
    ok: true,
    outputPath: input.outputPath,
    slideCount: input.deck.slides.length,
    auditIssues,
    message: 'PPT 导出完成。'
  }
}

async function renderSlide(context: RenderContext, slideSpec: SlideSpec): Promise<void> {
  const slide = context.pptx.addSlide()
  slide.background = { color: context.theme.colors.background }

  if (slideSpec.kind === 'cover') {
    renderCoverSlide(context, slide, slideSpec)
    return
  }

  renderSlideTitle(context, slide, slideSpec.title)

  if (slideSpec.kind === 'references') {
    renderReferencesSlide(context, slide)
    return
  }

  const bodyLayout = getBodyLayout(slideSpec)
  for (const [index, element] of slideSpec.elements.entries()) {
    await renderElement(context, slide, element, bodyLayout[index] ?? bodyLayout[bodyLayout.length - 1])
  }

  renderFooter(context, slide, slideSpec)
}

function renderCoverSlide(context: RenderContext, slide: pptxgen.Slide, slideSpec: SlideSpec): void {
  slide.addShape(context.pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_WIDTH,
    h: SLIDE_HEIGHT,
    fill: { color: context.theme.colors.background },
    line: { color: context.theme.colors.background }
  })
  slide.addShape(context.pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.16,
    h: SLIDE_HEIGHT,
    fill: { color: context.theme.colors.accent },
    line: { color: context.theme.colors.accent }
  })
  slide.addText(slideSpec.title || context.deck.title, {
    x: 0.85,
    y: 1.85,
    w: 10.9,
    h: 1.35,
    fontFace: context.theme.fonts.heading,
    fontSize: 34,
    bold: true,
    color: context.theme.colors.textPrimary,
    breakLine: false,
    fit: 'shrink'
  })
  slide.addText(context.deck.subtitle ?? '', {
    x: 0.88,
    y: 3.38,
    w: 9.6,
    h: 0.55,
    fontFace: context.theme.fonts.body,
    fontSize: 16,
    color: context.theme.colors.textSecondary,
    fit: 'shrink'
  })
  slide.addText(getCoverMetaText(context.deck), {
    x: 0.88,
    y: 6.45,
    w: 10.8,
    h: 0.36,
    fontFace: context.theme.fonts.body,
    fontSize: 10,
    color: context.theme.colors.textSecondary
  })
}

function renderSlideTitle(context: RenderContext, slide: pptxgen.Slide, title: string): void {
  slide.addText(title, {
    x: MARGIN_X,
    y: MARGIN_TOP,
    w: 11.7,
    h: 0.55,
    fontFace: context.theme.fonts.heading,
    fontSize: 22,
    bold: true,
    color: context.theme.colors.textPrimary,
    fit: 'shrink'
  })
  slide.addShape(context.pptx.ShapeType.line, {
    x: MARGIN_X,
    y: 1.08,
    w: 11.95,
    h: 0,
    line: { color: context.theme.colors.muted, transparency: 22 }
  })
}

async function renderElement(
  context: RenderContext,
  slide: pptxgen.Slide,
  element: SlideElementSpec,
  layout: SlideLayout
): Promise<void> {
  if (!layout) {
    return
  }

  switch (element.type) {
    case 'text':
      slide.addText(element.text, createTextOptions(context, layout, element.style))
      return
    case 'bullet-list':
      renderBulletList(context, slide, element.items, layout, element.style)
      return
    case 'image':
      await renderImage(context, slide, element, layout)
      return
    case 'table':
      renderTable(context, slide, element, layout)
      return
    case 'quote':
      renderQuote(context, slide, element, layout)
      return
    case 'formula':
      renderFormulaPlaceholder(context, slide, element, layout)
      return
    case 'diagram':
      renderDiagram(context, slide, element, layout)
      return
  }
}

function renderBulletList(
  context: RenderContext,
  slide: pptxgen.Slide,
  items: string[],
  layout: SlideLayout,
  style?: string
): void {
  const text: pptxgen.TextProps[] = items.map((item) => ({ text: item, options: { bullet: { type: 'bullet' } } }))
  slide.addText(text, {
    ...createTextOptions(context, layout, style),
    paraSpaceAfter: 8,
    breakLine: false
  })
}

async function renderImage(
  context: RenderContext,
  slide: pptxgen.Slide,
  element: Extract<SlideElementSpec, { type: 'image' }>,
  layout: SlideLayout
): Promise<void> {
  const asset = context.assets.get(element.assetId)
  const data = asset ? await context.resolveAsset?.(asset) : undefined

  if (data) {
    slide.addImage({
      data,
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: element.caption ? layout.h - 0.32 : layout.h
    })
  } else {
    slide.addShape(context.pptx.ShapeType.roundRect, {
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: element.caption ? layout.h - 0.32 : layout.h,
      rectRadius: 0.08,
      fill: { color: context.theme.colors.surface },
      line: { color: context.theme.colors.muted, transparency: 12 }
    })
    slide.addText('图片资产待补充', {
      x: layout.x,
      y: layout.y + layout.h / 2 - 0.18,
      w: layout.w,
      h: 0.36,
      align: 'center',
      fontFace: context.theme.fonts.body,
      fontSize: 12,
      color: context.theme.colors.textSecondary
    })
  }

  if (element.caption) {
    slide.addText(element.caption, {
      x: layout.x,
      y: layout.y + layout.h - 0.24,
      w: layout.w,
      h: 0.24,
      align: 'center',
      fontFace: context.theme.fonts.body,
      fontSize: 8,
      color: context.theme.colors.textSecondary,
      fit: 'shrink'
    })
  }
}

function renderTable(
  context: RenderContext,
  slide: pptxgen.Slide,
  element: Extract<SlideElementSpec, { type: 'table' }>,
  layout: SlideLayout
): void {
  const rows: pptxgen.TableRow[] = [element.columns, ...element.rows].map((row) =>
    row.map((cell) => ({
      text: cell,
      options: {
        margin: 0.06
      }
    }))
  )
  slide.addTable(rows, {
    x: layout.x,
    y: layout.y,
    w: layout.w,
    h: layout.h,
    fontFace: context.theme.fonts.body,
    fontSize: 9,
    color: context.theme.colors.textPrimary,
    border: { type: 'solid', color: context.theme.colors.muted, pt: 0.6 },
    fill: { color: context.theme.colors.surface },
    margin: 0.06
  })
}

function renderQuote(
  context: RenderContext,
  slide: pptxgen.Slide,
  element: Extract<SlideElementSpec, { type: 'quote' }>,
  layout: SlideLayout
): void {
  slide.addShape(context.pptx.ShapeType.rect, {
    x: layout.x,
    y: layout.y,
    w: 0.06,
    h: layout.h,
    fill: { color: context.theme.colors.accent },
    line: { color: context.theme.colors.accent }
  })
  slide.addText(element.text, {
    x: layout.x + 0.25,
    y: layout.y + 0.08,
    w: layout.w - 0.25,
    h: layout.h - 0.1,
    fontFace: context.theme.fonts.body,
    fontSize: 17,
    italic: true,
    color: context.theme.colors.textPrimary,
    fit: 'shrink',
    valign: 'middle'
  })
}

function renderFormulaPlaceholder(
  context: RenderContext,
  slide: pptxgen.Slide,
  element: Extract<SlideElementSpec, { type: 'formula' }>,
  layout: SlideLayout
): void {
  slide.addText(element.latex, {
    x: layout.x,
    y: layout.y,
    w: layout.w,
    h: layout.h,
    fontFace: context.theme.fonts.code,
    fontSize: element.displayMode ? 18 : 13,
    color: context.theme.colors.textPrimary,
    align: 'center',
    valign: 'middle',
    fit: 'shrink'
  })
}

function renderDiagram(
  context: RenderContext,
  slide: pptxgen.Slide,
  element: Extract<SlideElementSpec, { type: 'diagram' }>,
  layout: SlideLayout
): void {
  const source = normalizeDiagramSource(element.source)
  const diagramKind = element.diagramKind.toLowerCase()

  if (diagramKind === 'mermaid' && /^mindmap\b/i.test(source)) {
    renderMindmapDiagram(context, slide, parseMindmapLabels(source), layout)
    return
  }

  if (diagramKind === 'mermaid') {
    renderFlowDiagram(context, slide, parseFlowchartLabels(source), layout)
    return
  }

  renderDiagramFallback(context, slide, element, layout)
}

function renderFlowDiagram(
  context: RenderContext,
  slide: pptxgen.Slide,
  labels: string[],
  layout: SlideLayout
): void {
  const nodes = labels.length ? labels.slice(0, 5) : ['问题', '方法', '证据', '结论']
  const gap = 0.22
  const nodeW = Math.max(1.05, Math.min(1.7, (layout.w - gap * (nodes.length - 1)) / nodes.length))
  const totalW = nodeW * nodes.length + gap * (nodes.length - 1)
  const startX = layout.x + Math.max(0, (layout.w - totalW) / 2)
  const nodeH = Math.min(0.88, Math.max(0.58, layout.h * 0.28))
  const y = layout.y + layout.h / 2 - nodeH / 2

  renderDiagramSurface(context, slide, layout)

  nodes.forEach((label, index) => {
    const x = startX + index * (nodeW + gap)
    slide.addShape(context.pptx.ShapeType.roundRect, {
      x,
      y,
      w: nodeW,
      h: nodeH,
      rectRadius: 0.08,
      fill: { color: index === 0 ? context.theme.colors.accent : context.theme.colors.surface },
      line: { color: index === 0 ? context.theme.colors.accent : context.theme.colors.muted, transparency: 8 }
    })
    slide.addText(label, {
      x: x + 0.08,
      y: y + 0.08,
      w: nodeW - 0.16,
      h: nodeH - 0.16,
      align: 'center',
      valign: 'middle',
      fontFace: context.theme.fonts.body,
      fontSize: 10,
      bold: index === 0,
      color: index === 0 ? 'FFFFFF' : context.theme.colors.textPrimary,
      fit: 'shrink'
    })

    if (index < nodes.length - 1) {
      slide.addShape(context.pptx.ShapeType.line, {
        x: x + nodeW + 0.04,
        y: y + nodeH / 2,
        w: gap - 0.08,
        h: 0,
        line: {
          color: context.theme.colors.accent,
          width: 1,
          endArrowType: 'triangle'
        }
      })
    }
  })
}

function renderMindmapDiagram(
  context: RenderContext,
  slide: pptxgen.Slide,
  labels: { root: string; children: string[] },
  layout: SlideLayout
): void {
  const children = labels.children.length ? labels.children.slice(0, 6) : ['背景', '方法', '结果', '局限']
  const rootW = Math.min(2.1, Math.max(1.35, layout.w * 0.28))
  const rootH = Math.min(0.78, Math.max(0.52, layout.h * 0.18))
  const rootX = layout.x + layout.w / 2 - rootW / 2
  const rootY = layout.y + 0.28
  const childW = Math.min(1.75, Math.max(1.1, layout.w * 0.3))
  const childH = Math.min(0.58, Math.max(0.42, layout.h * 0.13))
  const rowGap = 0.18
  const leftX = layout.x + 0.28
  const rightX = layout.x + layout.w - childW - 0.28
  const firstChildY = rootY + rootH + 0.42

  renderDiagramSurface(context, slide, layout)
  slide.addShape(context.pptx.ShapeType.roundRect, {
    x: rootX,
    y: rootY,
    w: rootW,
    h: rootH,
    rectRadius: 0.12,
    fill: { color: context.theme.colors.accent },
    line: { color: context.theme.colors.accent }
  })
  slide.addText(labels.root, {
    x: rootX + 0.1,
    y: rootY + 0.08,
    w: rootW - 0.2,
    h: rootH - 0.16,
    align: 'center',
    valign: 'middle',
    fontFace: context.theme.fonts.body,
    fontSize: 11,
    bold: true,
    color: 'FFFFFF',
    fit: 'shrink'
  })

  children.forEach((child, index) => {
    const isLeft = index % 2 === 0
    const row = Math.floor(index / 2)
    const x = isLeft ? leftX : rightX
    const y = firstChildY + row * (childH + rowGap)
    const rootAnchorX = rootX + rootW / 2
    const childAnchorX = isLeft ? x + childW : x

    slide.addShape(context.pptx.ShapeType.line, {
      x: Math.min(rootAnchorX, childAnchorX),
      y: rootY + rootH,
      w: Math.abs(childAnchorX - rootAnchorX),
      h: y + childH / 2 - (rootY + rootH),
      line: { color: context.theme.colors.muted, width: 0.7 }
    })
    slide.addShape(context.pptx.ShapeType.roundRect, {
      x,
      y,
      w: childW,
      h: childH,
      rectRadius: 0.08,
      fill: { color: context.theme.colors.surface },
      line: { color: context.theme.colors.muted, transparency: 10 }
    })
    slide.addText(child, {
      x: x + 0.08,
      y: y + 0.06,
      w: childW - 0.16,
      h: childH - 0.12,
      align: 'center',
      valign: 'middle',
      fontFace: context.theme.fonts.body,
      fontSize: 9.5,
      color: context.theme.colors.textPrimary,
      fit: 'shrink'
    })
  })
}

function renderDiagramSurface(context: RenderContext, slide: pptxgen.Slide, layout: SlideLayout): void {
  slide.addShape(context.pptx.ShapeType.roundRect, {
    x: layout.x,
    y: layout.y,
    w: layout.w,
    h: layout.h,
    rectRadius: 0.08,
    fill: { color: context.theme.colors.surface },
    line: { color: context.theme.colors.muted, transparency: 18 }
  })
}

function renderDiagramFallback(
  context: RenderContext,
  slide: pptxgen.Slide,
  element: Extract<SlideElementSpec, { type: 'diagram' }>,
  layout: SlideLayout
): void {
  renderFlowDiagram(context, slide, parseFlowchartLabels(element.source), layout)
}

function parseFlowchartLabels(source: string): string[] {
  const labels: string[] = []
  const lines = getMermaidBodyLines(source)

  for (const line of lines) {
    labels.push(...extractFlowNodeLabels(line))
  }

  if (labels.length === 0) {
    lines
      .join('\n')
      .split(/\n|-->|---|==>|-.->|--|---/g)
      .map(cleanDiagramLabel)
      .filter(Boolean)
      .forEach((label) => labels.push(label))
  }

  return uniqueDiagramLabels(labels).slice(0, 5)
}

function parseMindmapLabels(source: string): { root: string; children: string[] } {
  const lines = getMermaidBodyLines(source)
  const rootLine = lines.find((line) => /^root\b/i.test(line))
  const root = cleanDiagramLabel(rootLine?.replace(/^root/i, '') ?? lines[1] ?? '主题') || '主题'
  const children = lines
    .filter((line) => !/^mindmap\b/i.test(line) && !/^root\b/i.test(line))
    .map(cleanDiagramLabel)
    .filter(Boolean)

  return {
    root,
    children: uniqueDiagramLabels(children).slice(0, 6)
  }
}

function normalizeDiagramSource(source: string): string {
  const stripped = stripMermaidCodeFence(source).trim()
  if (/^(flowchart|graph|mindmap)\b/i.test(stripped)) {
    return stripped
  }

  if (/(-->|---|==>|-.->)/.test(stripped)) {
    return `flowchart LR\n${stripped}`
  }

  return stripped
}

function stripMermaidCodeFence(source: string): string {
  return source
    .replace(/\r/g, '\n')
    .replace(/^\s*```(?:mermaid)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/^\s*mermaid\s*\n/i, '')
}

function getMermaidBodyLines(source: string): string[] {
  return stripMermaidCodeFence(source)
    .split('\n')
    .map((line) => line.replace(/;+\s*$/g, '').trim())
    .filter((line) => Boolean(line) && !/^%%/.test(line))
    .filter((line) => !/^(classDef|class|style|linkStyle|click|subgraph|end)\b/i.test(line))
}

function extractFlowNodeLabels(line: string): string[] {
  const labels: string[] = []
  const nodePattern =
    /(?:^|[\s;|])([A-Za-z0-9_\-\u4e00-\u9fff]+)\s*(\[\[.*?\]\]|\[.*?\]|\(\(.*?\)\)|\(.*?\)|\{.*?\})/gu
  let match: RegExpExecArray | null

  while ((match = nodePattern.exec(line))) {
    const label = cleanDiagramLabel(match[2])
    if (label) {
      labels.push(label)
    }
  }

  return labels
}

function cleanDiagramLabel(input: string | undefined): string {
  return (input ?? '')
    .replace(/^flowchart\s+\w+$/i, '')
    .replace(/^graph\s+\w+$/i, '')
    .replace(/^mindmap$/i, '')
    .replace(/\|[^|]*\|/g, '')
    .replace(/^\s*[A-Za-z0-9_\-\u4e00-\u9fff]+\s*(?=[\[(\{])/u, '')
    .replace(/^(\[\[|\[|\(\(|\(|\{)+/u, '')
    .replace(/(\]\]|\]|\)\)|\)|\})+$/u, '')
    .replace(/^["'`]+|["'`;]+$/g, '')
    .replace(/^(-->|---|==>|-.->)+/g, '')
    .replace(/(-->|---|==>|-.->)+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
}

function uniqueDiagramLabels(labels: string[]): string[] {
  const seen = new Set<string>()
  return labels.filter((label) => {
    const key = label.toLowerCase()
    if (!label || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function renderReferencesSlide(context: RenderContext, slide: pptxgen.Slide): void {
  const citations = context.deck.citations.slice(0, 10)
  if (citations.length === 0) {
    slide.addText('暂无参考文献。', createTextOptions(context, { x: MARGIN_X, y: CONTENT_TOP, w: 11.8, h: 0.5 }))
    return
  }

  const rows = citations.map((citation, index) => {
    const authors = citation.authors.length > 0 ? citation.authors.slice(0, 3).join(', ') : 'Unknown'
    const year = citation.year ? ` (${citation.year})` : ''
    return `${index + 1}. ${authors}${year}. ${citation.title}${citation.doi ? ` DOI: ${citation.doi}` : ''}`
  })

  slide.addText(rows.join('\n'), {
    x: MARGIN_X,
    y: CONTENT_TOP,
    w: 11.8,
    h: CONTENT_HEIGHT,
    fontFace: context.theme.fonts.body,
    fontSize: 10,
    color: context.theme.colors.textPrimary,
    breakLine: false,
    fit: 'shrink'
  })
}

function renderFooter(context: RenderContext, slide: pptxgen.Slide, slideSpec: SlideSpec): void {
  const sources = slideSpec.sourceRefs
    .map((sourceRef) => (sourceRef.pageNo ? `p.${sourceRef.pageNo}` : sourceRef.type))
    .slice(0, 4)
    .join(' · ')

  slide.addText(sources ? `来源：${sources}` : '', {
    x: MARGIN_X,
    y: 7.08,
    w: 10.5,
    h: 0.22,
    fontFace: context.theme.fonts.body,
    fontSize: 7,
    color: context.theme.colors.textSecondary,
    fit: 'shrink'
  })
}

function getBodyLayout(slideSpec: SlideSpec): SlideLayout[] {
  if (slideSpec.kind === 'two-column' || slideSpec.kind === 'comparison') {
    return [
      { x: MARGIN_X, y: CONTENT_TOP, w: 5.75, h: CONTENT_HEIGHT },
      { x: 6.9, y: CONTENT_TOP, w: 5.75, h: CONTENT_HEIGHT }
    ]
  }

  if (slideSpec.kind === 'figure') {
    return [
      { x: MARGIN_X, y: CONTENT_TOP, w: 7.35, h: CONTENT_HEIGHT },
      { x: 8.35, y: CONTENT_TOP, w: 4.25, h: CONTENT_HEIGHT }
    ]
  }

  if (slideSpec.elements.length >= 2) {
    return slideSpec.elements.map((_element, index) => ({
      x: MARGIN_X,
      y: CONTENT_TOP + index * (CONTENT_HEIGHT / slideSpec.elements.length),
      w: 11.85,
      h: CONTENT_HEIGHT / slideSpec.elements.length - 0.14
    }))
  }

  return [{ x: MARGIN_X, y: CONTENT_TOP, w: 11.85, h: CONTENT_HEIGHT }]
}

function createTextOptions(context: RenderContext, layout: SlideLayout, style?: string): pptxgen.TextPropsOptions {
  return {
    x: layout.x,
    y: layout.y,
    w: layout.w,
    h: layout.h,
    fontFace: style === 'code' ? context.theme.fonts.code : context.theme.fonts.body,
    fontSize: style === 'caption' ? 10 : 16,
    color: style === 'muted' || style === 'caption' ? context.theme.colors.textSecondary : context.theme.colors.textPrimary,
    breakLine: false,
    fit: 'shrink',
    valign: 'middle'
  }
}

function mergeTheme(theme?: Partial<PptThemeConfig>): PptThemeConfig {
  return {
    ...defaultPptTheme,
    ...theme,
    fonts: {
      ...defaultPptTheme.fonts,
      ...theme?.fonts
    },
    colors: {
      ...defaultPptTheme.colors,
      ...theme?.colors
    }
  }
}

function createAuditIssue(
  severity: PptAuditIssue['severity'],
  code: string,
  message: string,
  slideId?: string,
  assetId?: string
): PptAuditIssue {
  return {
    severity,
    code,
    message,
    slideId,
    assetId
  }
}

function isTransitionSlide(slide: SlideSpec): boolean {
  return slide.kind === 'cover' || slide.kind === 'agenda' || slide.kind === 'section' || slide.kind === 'appendix'
}

function getCoverMetaText(deck: DeckSpec): string {
  const generatedDate = deck.meta.generatedAt ? new Date(deck.meta.generatedAt).toLocaleDateString('zh-CN') : ''
  return [deck.audience, generatedDate].filter(Boolean).join(' · ')
}
