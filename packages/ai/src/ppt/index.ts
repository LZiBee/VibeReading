import type {
  DeckAudience,
  DeckIntent,
  DeckLanguage,
  DeckSpec,
  DeckTone,
  EntityId,
  SlideKind,
  SourceRef
} from '@thesis-agent/shared'
import { collectEvidenceItems, isLikelyRawPdfNoise, normalizeEvidenceText } from './cleaning'
import { generatePaperDigestFromMaterials } from './digest'
import { generateSlideDraftsFromPlan, generateSlidePlanFromDigest } from './planning'
import type {
  GenerateDeckSpecFromAiDraftJsonInput,
  GenerateDeckSpecInput,
  GenerateDeckSpecResult,
  PaperDigest,
  PptDeckMaterials,
  PptEvidenceItem,
  PptEvidenceKind,
  PptDeckPipelineState,
  SlideDraft
} from './types'

export type {
  DeckContentQualityIssue,
  DigestPoint,
  DigestTerm,
  GenerateDeckSpecFromAiDraftJsonInput,
  GenerateDeckSpecInput,
  GenerateDeckSpecResult,
  PaperDigest,
  PlannedSlide,
  PlannedSlideKind,
  PptDeckMaterials,
  PptDeckPipelineState,
  PptEvidenceItem,
  PptEvidenceKind,
  PptPaperMaterial,
  PptReferenceMaterial,
  PptTextMaterial,
  SlideDraft,
  SlidePlan
} from './types'

const aiGeneratorVersion = 'ppt-ai-draft-pipeline-0.3.0'
const slideKindValues: SlideKind[] = [
  'cover',
  'agenda',
  'section',
  'bullet',
  'two-column',
  'figure',
  'table',
  'quote',
  'comparison',
  'timeline',
  'references',
  'appendix'
]

export const pptDeckSystemPrompt = [
  '你是严谨的学术汇报 PPT 编排助手。',
  '你先理解论文，再生成演示文稿结构，不直接把 PDF 原文碎片塞进幻灯片。',
  '输出必须符合 PaperDigest、SlidePlan、SlideDraft 和 DeckSpec 的结构化约束。',
  '每页正文不超过 5 个要点，每个要点应是可口头汇报的完整观点句。',
  '必须过滤重复标题、孤立数字、表格残片、页眉页脚和低信息密度关键词堆。',
  '生成组会 PPT 时采用视觉优先策略：能用论文原图或截图就优先使用原图；没有原图时为正文页生成论文结构脑图、问题树、对比图或实验关系图。',
  '自制图示默认使用脑图，只有确实需要表达严格先后顺序、数据流或因果链时才使用流程图。',
  '除封面和参考文献页外，每页都应尽量包含 visual；不要连续 3 页使用纯 bullet 版式。'
].join('\n')

export function createDeckIntentFromMaterials(input: GenerateDeckSpecInput): DeckIntent {
  const sourceIds = getSourceIds(input.materials)
  const partialIntent = input.intent ?? {}

  return {
    sourceType: partialIntent.sourceType ?? (input.materials.paper ? 'paper' : 'note'),
    sourceIds: partialIntent.sourceIds?.length ? partialIntent.sourceIds : sourceIds,
    audience: partialIntent.audience ?? 'group-meeting',
    language: partialIntent.language ?? 'zh-CN',
    tone: partialIntent.tone ?? 'academic',
    targetSlideCount: clampInteger(partialIntent.targetSlideCount, 8, 12, 10),
    templateId: partialIntent.templateId,
    includeReferences: partialIntent.includeReferences ?? true,
    includeAgenda: partialIntent.includeAgenda ?? true,
    includeAppendix: partialIntent.includeAppendix ?? false
  }
}

export function generatePptDeckPipelineState(input: GenerateDeckSpecInput): PptDeckPipelineState {
  const intent = createDeckIntentFromMaterials(input)
  const evidenceItems = collectEvidenceItems(input.materials)
  const digest = generatePaperDigestFromMaterials({
    materials: input.materials,
    evidenceItems
  })
  const plan = generateSlidePlanFromDigest({
    digest,
    intent,
    materials: input.materials
  })
  const { drafts, issues } = generateSlideDraftsFromPlan({
    plan,
    digest,
    materials: input.materials
  })

  return {
    evidenceItems,
    digest,
    plan,
    drafts,
    issues
  }
}

export function generateDeckSpecFromAiDraftJson(input: GenerateDeckSpecFromAiDraftJsonInput): GenerateDeckSpecResult {
  const intent = createDeckIntentFromMaterials(input)
  const now = input.now ?? new Date().toISOString()
  const pipeline = generatePptDeckPipelineState(input)
  const parsedDrafts = parseAiSlideDrafts(input.aiOutput)
  const mergeResult = mergeAiDraftsWithPlannedDrafts(parsedDrafts, pipeline.drafts)
  const warnings: string[] = []

  for (const issue of pipeline.issues) {
    if (issue.severity !== 'info') {
      warnings.push(issue.message)
    }
  }

  warnings.push(...mergeResult.warnings)

  const deck = createDeckSpecFromDrafts({
    input,
    intent,
    now,
    digest: pipeline.digest,
    drafts: mergeResult.drafts,
    generatorVersion: input.generatorVersion ?? aiGeneratorVersion
  })

  return {
    intent,
    deck,
    warnings: uniqueStrings(warnings)
  }
}

export function buildDeckSpecPrompt(input: GenerateDeckSpecInput): string {
  const intent = createDeckIntentFromMaterials(input)
  const evidenceItems = collectEvidenceItems(input.materials)
  const digest = generatePaperDigestFromMaterials({
    materials: input.materials,
    evidenceItems
  })
  const plan = generateSlidePlanFromDigest({
    digest,
    intent,
    materials: input.materials
  })

  return [
    pptDeckSystemPrompt,
    '',
    '请根据以下导出意图、论文理解摘要、页面规划和清洗后证据，生成 PPT 页面草稿 JSON。',
    '只输出一个 JSON 对象，不要输出 Markdown，不要输出 PowerPoint API 调用，不要解释过程。',
    'JSON 结构必须是：{"drafts":[{"slideId":"...","title":"...","subtitle":"...","bullets":["..."],"speakerNotes":"...","slideKind":"two-column","visual":{"kind":"diagram","diagramKind":"mermaid","source":"mindmap\\n  root((研究问题))\\n    背景动机\\n    方法模块\\n    实验证据"}}]}。',
    '必须复用页面规划里的 slideId；每页 bullets 不超过 5 条；每条 bullet 必须是可口头汇报的完整观点句。',
    '必须为页面规划中的每一页都返回草稿；缺页、空草稿或无法解析都会导致导出失败。',
    '不要复制 PDF 原文长句；不要保留重复标题、孤立数字、Table/Figure 残片、页眉页脚或只有系统名的关键词堆。',
    '正文页必须尽量提供 visual：优先从“可用图片资产”选择 kind=figure 和 assetId；没有合适原图时生成 kind=diagram、diagramKind=mermaid 的自制图示。',
    'Mermaid 图示优先使用 mindmap：第一行必须是 mindmap，第二行使用 root((主题))，后续每行用缩进表达 3 到 5 个分支。',
    '只有页面必须表达严格先后顺序、数据流或因果链时才使用 flowchart LR；流程图必须使用 ASCII 节点 id，并采用 A["短句"] --> B["短句"] 这类节点声明。',
    '不要使用 graph TD、subgraph、classDef、style、sequenceDiagram、HTML 或 Markdown 代码围栏。',
    '',
    `导出意图：${JSON.stringify(intent, null, 2)}`,
    '',
    `论文理解摘要：${JSON.stringify(digest, null, 2)}`,
    '',
    `页面规划：${JSON.stringify(plan, null, 2)}`,
    '',
    `可用图片资产：${JSON.stringify(compactVisualAssetsForPrompt(input.materials), null, 2)}`,
    '',
    `清洗后证据：${JSON.stringify(compactEvidenceItemsForPrompt(evidenceItems), null, 2)}`
  ].join('\n')
}

function compactVisualAssetsForPrompt(materials: PptDeckMaterials): Array<{
  id: string
  kind: string
  alt?: string
  width?: number
  height?: number
}> {
  return (materials.assets ?? []).slice(0, 10).map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    alt: asset.alt?.slice(0, 80),
    width: asset.width,
    height: asset.height
  }))
}

function compactEvidenceItemsForPrompt(evidenceItems: PptEvidenceItem[]): Array<{
  id: string
  kind: PptEvidenceKind
  title: string
  pageNo?: number
  score: number
  text: string
}> {
  return evidenceItems.slice(0, 12).map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title.slice(0, 80),
    pageNo: item.pageNo,
    score: item.score,
    text: item.normalizedText.slice(0, 520)
  }))
}

type RawAiSlideDraft = {
  slideId?: unknown
  title?: unknown
  subtitle?: unknown
  bullets?: unknown
  speakerNotes?: unknown
  notes?: unknown
  slideKind?: unknown
  kind?: unknown
  visual?: unknown
}

function createDeckSpecFromDrafts(input: {
  input: GenerateDeckSpecInput
  intent: DeckIntent
  now: string
  digest: PaperDigest
  drafts: SlideDraft[]
  generatorVersion: string
}): DeckSpec {
  const sourceRefs = getDigestSourceRefs(input.digest)

  return {
    title: input.digest.title,
    subtitle: buildDeckSubtitle(input.input.materials, input.intent, input.digest),
    themeId: input.intent.templateId ?? 'academic-clean',
    language: input.intent.language,
    audience: input.intent.audience,
    slides: input.drafts.map((draft) => createSlideSpecFromDraft(draft, input.digest)),
    assets: input.input.materials.assets ?? [],
    citations: (input.input.materials.references ?? []).map((reference) => ({
      id: reference.id,
      title: reference.title,
      authors: reference.authors ?? [],
      year: reference.year,
      venue: reference.venue,
      doi: reference.doi,
      url: reference.url,
      sourceRefs: reference.sourceRefs
    })),
    meta: {
      generatedAt: input.now,
      sourceIds: input.intent.sourceIds.length
        ? input.intent.sourceIds
        : sourceRefs.map((sourceRef) => sourceRef.paperId).filter((id): id is EntityId => Boolean(id)),
      generatorVersion: input.generatorVersion
    }
  }
}

function parseAiSlideDrafts(aiOutput: string): RawAiSlideDraft[] {
  const jsonText = extractJsonText(aiOutput)
  if (!jsonText) {
    throw new Error('AI 没有返回可解析的 JSON。')
  }

  const parsed: unknown = JSON.parse(jsonText)
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord)
  }

  if (!isRecord(parsed)) {
    throw new Error('AI JSON 根节点必须是对象或数组。')
  }

  const drafts = parsed.drafts ?? parsed.slideDrafts ?? parsed.slides
  if (!Array.isArray(drafts)) {
    throw new Error('AI JSON 中缺少 drafts / slideDrafts / slides 数组。')
  }

  const rawDrafts = drafts.filter(isRecord)
  if (rawDrafts.length === 0) {
    throw new Error('AI 返回的页面草稿为空，已停止 PPT 导出。')
  }

  return rawDrafts
}

function mergeAiDraftsWithPlannedDrafts(
  rawDrafts: RawAiSlideDraft[],
  plannedDrafts: SlideDraft[]
): { drafts: SlideDraft[]; warnings: string[] } {
  const warnings: string[] = []
  const rawDraftsById = new Map<string, RawAiSlideDraft>()

  rawDrafts.forEach((rawDraft) => {
    if (typeof rawDraft.slideId === 'string' && rawDraft.slideId.trim()) {
      rawDraftsById.set(rawDraft.slideId.trim(), rawDraft)
    }
  })

  const drafts = plannedDrafts.map((plannedDraft, index) => {
    const rawDraft = rawDraftsById.get(plannedDraft.slideId) ?? rawDrafts[index]
    if (!rawDraft) {
      throw new Error(`AI 未返回「${plannedDraft.title}」页面草稿，已停止 PPT 导出。`)
    }

    if (!hasAiDraftContent(rawDraft)) {
      throw new Error(`AI 返回的「${plannedDraft.title}」页面草稿为空，已停止 PPT 导出。`)
    }

    return mergeAiDraftWithPlannedDraft(rawDraft, plannedDraft, warnings)
  })

  return {
    drafts,
    warnings
  }
}

function hasAiDraftContent(rawDraft: RawAiSlideDraft): boolean {
  return (
    typeof rawDraft.title === 'string' ||
    typeof rawDraft.subtitle === 'string' ||
    Array.isArray(rawDraft.bullets) ||
    typeof rawDraft.speakerNotes === 'string' ||
    typeof rawDraft.notes === 'string' ||
    isRecord(rawDraft.visual)
  )
}

function mergeAiDraftWithPlannedDraft(rawDraft: RawAiSlideDraft, plannedDraft: SlideDraft, warnings: string[]): SlideDraft {
  const title = readAiText(rawDraft.title, 48)
  if (!title) {
    throw new Error(`AI 返回的「${plannedDraft.title}」页面缺少标题，已停止 PPT 导出。`)
  }

  const subtitle = readAiText(rawDraft.subtitle, 140) || plannedDraft.subtitle
  const bullets = readAiBullets(rawDraft.bullets, plannedDraft.title, warnings)
  if (plannedDraft.bullets.length > 0 && bullets.length === 0) {
    throw new Error(`AI 返回的「${plannedDraft.title}」页面缺少有效要点，已停止 PPT 导出。`)
  }

  const speakerNotes =
    readAiText(rawDraft.speakerNotes, 700) || readAiText(rawDraft.notes, 700) || plannedDraft.speakerNotes
  const slideKind = readAiSlideKind(rawDraft.slideKind ?? rawDraft.kind) ?? plannedDraft.slideKind
  const visual = readAiVisual(rawDraft.visual, plannedDraft.visual, plannedDraft.title, warnings)

  return {
    ...plannedDraft,
    slideKind,
    title,
    subtitle,
    bullets,
    speakerNotes,
    visual
  }
}

function readAiVisual(
  input: unknown,
  plannedVisual: SlideDraft['visual'],
  slideTitle: string,
  warnings: string[]
): SlideDraft['visual'] {
  if (!isRecord(input)) {
    return plannedVisual
  }

  const kind = typeof input.kind === 'string' ? input.kind : undefined
  if (kind === 'figure') {
    const assetId = readAiText(input.assetId, 160)
    if (!assetId) {
      warnings.push(`AI 在「${slideTitle}」中返回了缺少 assetId 的图片 visual，已使用规划图示。`)
      return plannedVisual
    }

    return {
      kind: 'figure',
      assetId,
      caption: readAiText(input.caption, 80) ?? plannedVisual?.caption
    }
  }

  if (kind === 'diagram') {
    const source = readAiMultilineText(input.source, 900)
    if (!source) {
      warnings.push(`AI 在「${slideTitle}」中返回了缺少 source 的图示 visual，已使用规划图示。`)
      return plannedVisual
    }

    if (input.diagramKind === 'graphviz') {
      warnings.push(`AI 在「${slideTitle}」中返回了暂不支持稳定渲染的 graphviz 图示，已使用规划 Mermaid 图示。`)
      return plannedVisual
    }

    const mermaidSource = normalizeAiMermaidSource(source)
    if (!mermaidSource) {
      warnings.push(`AI 在「${slideTitle}」中返回了超出当前渲染子集的 Mermaid 图示，已使用规划图示。`)
      return plannedVisual
    }

    return {
      kind: 'diagram',
      diagramKind: 'mermaid',
      source: mermaidSource,
      caption: readAiText(input.caption, 80) ?? plannedVisual?.caption
    }
  }

  if (kind === 'table') {
    return {
      kind: 'table',
      caption: readAiText(input.caption, 120) ?? plannedVisual?.caption
    }
  }

  if (kind === 'none') {
    return plannedVisual
  }

  return plannedVisual
}

function normalizeAiMermaidSource(source: string): string | undefined {
  const stripped = source
    .replace(/\r/g, '\n')
    .replace(/^\s*```(?:mermaid)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/^\s*mermaid\s*\n/i, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !/^%%/.test(line))
    .filter((line) => !/^(classDef|class|style|linkStyle|click|subgraph|end)\b/i.test(line))
    .join('\n')
    .trim()

  if (!stripped) {
    return undefined
  }

  if (/^(sequenceDiagram|stateDiagram|classDiagram|erDiagram|gantt|pie|journey|gitGraph)\b/i.test(stripped)) {
    return undefined
  }

  if (/^(flowchart|graph|mindmap)\b/i.test(stripped)) {
    return stripped
  }

  if (/(-->|---|==>|-.->)/.test(stripped)) {
    return `flowchart LR\n${stripped}`
  }

  return undefined
}

function readAiBullets(input: unknown, slideTitle: string, warnings: string[]): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  const seen = new Set<string>()
  const bullets: string[] = []

  for (const item of input) {
    const bullet = readAiText(item, 110)
    if (!bullet) {
      continue
    }

    const key = bullet.toLowerCase().replace(/\s+/g, '')
    if (seen.has(key)) {
      continue
    }

    if (isLikelyRawPdfNoise(bullet)) {
      warnings.push(`AI 在「${slideTitle}」中返回疑似 PDF 噪声，已过滤：${bullet.slice(0, 32)}`)
      continue
    }

    seen.add(key)
    bullets.push(bullet)

    if (bullets.length >= 5) {
      break
    }
  }

  return bullets
}

function readAiText(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string') {
    return undefined
  }

  const text = normalizeEvidenceText(input)
    .replace(/^[-*•\d.、\s]+/u, '')
    .trim()

  return text ? text.slice(0, maxLength) : undefined
}

function readAiMultilineText(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string') {
    return undefined
  }

  const text = input
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text ? text.slice(0, maxLength) : undefined
}

function readAiSlideKind(input: unknown): SlideKind | undefined {
  return typeof input === 'string' && slideKindValues.includes(input as SlideKind) ? (input as SlideKind) : undefined
}

function extractJsonText(input: string): string | undefined {
  const trimmed = input.trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```\s*$/i.exec(trimmed)
  const candidate = fenceMatch?.[1]?.trim() || trimmed

  return sliceJsonText(candidate)
}

function sliceJsonText(candidate: string): string | undefined {
  const objectStart = candidate.indexOf('{')
  const arrayStart = candidate.indexOf('[')

  if (objectStart === -1 && arrayStart === -1) {
    return undefined
  }

  if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
    const arrayEnd = candidate.lastIndexOf(']')
    return arrayEnd > arrayStart ? candidate.slice(arrayStart, arrayEnd + 1) : undefined
  }

  const objectEnd = candidate.lastIndexOf('}')
  return objectEnd > objectStart ? candidate.slice(objectStart, objectEnd + 1) : undefined
}

function createSlideSpecFromDraft(draft: SlideDraft, digest: PaperDigest): DeckSpec['slides'][number] {
  if (draft.planKind === 'cover') {
    return {
      id: draft.slideId,
      kind: 'cover',
      title: draft.title,
      notes: draft.speakerNotes,
      elements: draft.subtitle
        ? [
            {
              type: 'text',
              text: draft.subtitle,
              style: 'body',
              sourceRefs: draft.sourceRefs
            }
          ]
        : [],
      sourceRefs: draft.sourceRefs
    }
  }

  if (draft.planKind === 'references') {
    return {
      id: draft.slideId,
      kind: 'references',
      title: draft.title,
      notes: draft.speakerNotes,
      elements: [],
      sourceRefs: draft.sourceRefs
    }
  }

  const elements: DeckSpec['slides'][number]['elements'] = []

  if (draft.visual?.kind === 'figure' && draft.visual.assetId) {
    elements.push({
      type: 'image',
      assetId: draft.visual.assetId,
      caption: draft.visual.caption,
      sourceRefs: draft.sourceRefs
    })
  }

  if (draft.visual?.kind === 'table' && draft.visual.caption) {
    elements.push({
      type: 'quote',
      text: draft.visual.caption,
      sourceRefs: draft.sourceRefs
    })
  }

  if (draft.visual?.kind === 'diagram' && draft.visual.source) {
    elements.push({
      type: 'diagram',
      diagramKind: draft.visual.diagramKind ?? 'mermaid',
      source: draft.visual.source,
      sourceRefs: draft.sourceRefs
    })
  }

  if (draft.bullets.length > 0) {
    elements.push({
      type: 'bullet-list',
      items: draft.bullets,
      sourceRefs: draft.sourceRefs
    })
  } else if (draft.subtitle) {
    elements.push({
      type: 'text',
      text: draft.subtitle,
      sourceRefs: draft.sourceRefs
    })
  }

  if (draft.planKind === 'conclusion' && digest.terms.length > 0) {
    elements.push({
      type: 'text',
      text: `关键词：${digest.terms.slice(0, 5).map((term) => term.term).join('、')}`,
      style: 'muted',
      sourceRefs: draft.sourceRefs
    })
  }

  return {
    id: draft.slideId,
    kind: normalizeSlideKind(draft.slideKind),
    title: draft.title,
    notes: draft.speakerNotes,
    elements,
    sourceRefs: draft.sourceRefs
  }
}

function normalizeSlideKind(kind: SlideKind): SlideKind {
  return kind
}

function buildDeckSubtitle(materials: PptDeckMaterials, intent: DeckIntent, digest: PaperDigest): string {
  const audienceText = getAudienceLabel(intent.audience)
  const paperMeta = [materials.paper?.authors?.slice(0, 3).join(', '), materials.paper?.year].filter(Boolean).join(' · ')
  return [audienceText, paperMeta, digest.oneSentenceSummary].filter(Boolean).join(' | ')
}

function getDigestSourceRefs(digest: PaperDigest): SourceRef[] {
  return uniqueSourceRefs(
    [
      ...digest.researchProblem,
      ...digest.motivation,
      ...digest.method,
      ...digest.experiments,
      ...digest.findings,
      ...digest.limitations
    ].flatMap((point) => point.evidenceRefs)
  ).slice(0, 16)
}

function uniqueSourceRefs(sourceRefs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>()
  return sourceRefs.filter((sourceRef) => {
    const key = JSON.stringify({
      type: sourceRef.type,
      paperId: sourceRef.paperId,
      noteId: sourceRef.noteId,
      noteBlockId: sourceRef.noteBlockId,
      pageNo: sourceRef.pageNo,
      messageId: sourceRef.messageId,
      referenceId: sourceRef.referenceId,
      rect: sourceRef.rect
    })

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function getSourceIds(materials: PptDeckMaterials): EntityId[] {
  return [
    materials.paper?.id,
    ...(materials.excerpts ?? []).map((item) => item.id),
    ...(materials.notes ?? []).map((item) => item.id),
    ...(materials.aiAnswers ?? []).map((item) => item.id)
  ].filter((id): id is EntityId => Boolean(id))
}

function getAudienceLabel(audience: DeckAudience): string {
  switch (audience) {
    case 'self-study':
      return '自学整理'
    case 'group-meeting':
      return '组会汇报'
    case 'class-report':
      return '课程报告'
    case 'thesis-defense':
      return '论文答辩'
  }
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)]
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object'
}

function clampInteger(input: unknown, min: number, max: number, fallback: number): number {
  return typeof input === 'number' && Number.isInteger(input) ? Math.min(max, Math.max(min, input)) : fallback
}

export const pptDeckAudienceValues: DeckAudience[] = ['self-study', 'group-meeting', 'class-report', 'thesis-defense']
export const pptDeckLanguageValues: DeckLanguage[] = ['zh-CN', 'en-US']
export const pptDeckToneValues: DeckTone[] = ['academic', 'briefing', 'teaching']
