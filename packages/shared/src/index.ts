export type EntityId = string

export type MineruModelVersion = 'pipeline' | 'vlm' | 'MinerU-HTML'

export type MineruBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'equation'
  | 'image'
  | 'chart'
  | 'table'
  | 'footnote'

export type MineruParseBlock = {
  id: EntityId
  type: MineruBlockType
  rawType: string
  pageNo: number
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  segments?: Array<{
    pageNo: number
    rect: {
      x: number
      y: number
      width: number
      height: number
    }
  }>
  text?: string
  headingLevel?: 1 | 2 | 3
  listItems?: string[]
  tableRows?: string[][]
  caption?: string
  footnotes?: string[]
  imageDataUrl?: string
}

export type MineruParseResult = {
  title: string
  markdown: string
  blocks: MineruParseBlock[]
}

export type CodeRepositoryImportantFileKind =
  | 'readme'
  | 'config'
  | 'entry'
  | 'source'
  | 'notebook'
  | 'script'
  | 'other'

export type CodeRepositoryImportantFile = {
  path: string
  kind: CodeRepositoryImportantFileKind
  size: number
}

export type CodeRepositoryPreparationInput = {
  paperPath: string
  repositoryUrl: string
}

export type CodeRepositoryPreparationResult = {
  repositoryUrl: string
  normalizedUrl: string
  owner: string
  repo: string
  cacheKey: string
  cloned: boolean
  reusedCache: boolean
  commit?: string
  branch?: string
  fileCount: number
  maxFiles: number
  scanLimitReached: boolean
  languageCounts: Record<string, number>
  importantFiles: CodeRepositoryImportantFile[]
  warnings: string[]
}

export function normalizeGitHubRepositoryUrl(input: string): {
  normalizedUrl: string
  owner: string
  repo: string
} | null {
  const value = input.trim()
  if (!value) {
    return null
  }

  const match = value.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i)
  if (!match) {
    return null
  }

  const owner = cleanGitHubRepositoryPathSegment(match[1])
  const repo = cleanGitHubRepositoryPathSegment(match[2]).replace(/\.git$/i, '')
  if (!isValidGitHubRepositoryPathSegment(owner) || !isValidGitHubRepositoryPathSegment(repo)) {
    return null
  }

  return {
    normalizedUrl: `https://github.com/${owner}/${repo}`,
    owner,
    repo
  }
}

type MineruRect = MineruParseBlock['rect']
type MineruBlockSegment = NonNullable<MineruParseBlock['segments']>[number]
type MineruBlockEntry = {
  block: MineruParseBlock
  index: number
}

export function normalizeMineruParseResultSegments(result: MineruParseResult): MineruParseResult {
  const blocksByPage = new Map<number, MineruBlockEntry[]>()
  result.blocks.forEach((block, index) => {
    const pageBlocks = blocksByPage.get(block.pageNo) ?? []
    pageBlocks.push({ block, index })
    blocksByPage.set(block.pageNo, pageBlocks)
  })

  let changed = false
  const blocks = result.blocks.map((block, index) => {
    if (block.segments && block.segments.length > 1) {
      return block
    }

    const inferredSegments = [
      inferMineruSamePageCrossColumnSegment(block, index, blocksByPage.get(block.pageNo) ?? []),
      inferMineruNextPageCrossPageSegment(
        block,
        blocksByPage.get(block.pageNo) ?? [],
        blocksByPage.get(block.pageNo + 1) ?? []
      )
    ].filter((segment): segment is MineruBlockSegment => Boolean(segment))

    if (inferredSegments.length === 0) {
      return block
    }

    const segments = uniqueMineruSegments([
      ...(block.segments ?? [{ pageNo: block.pageNo, rect: block.rect }]),
      ...inferredSegments
    ])
    if (segments.length <= 1) {
      return block
    }

    changed = true
    return {
      ...block,
      segments
    }
  })

  return changed ? { ...result, blocks } : result
}

function inferMineruSamePageCrossColumnSegment(
  block: MineruParseBlock,
  index: number,
  pageBlocks: MineruBlockEntry[]
): MineruBlockSegment | undefined {
  if (!isMineruCrossColumnCandidate(block)) {
    return undefined
  }

  const bodyTop = getMineruPageBodyTop(pageBlocks)
  const nextRightBlockEntry = pageBlocks
    .filter((entry) => entry.index > index && isReadableMineruTextBlock(entry.block) && isRightColumnMineruRect(entry.block.rect))
    .sort((left, right) => left.block.rect.y - right.block.rect.y)[0]

  if (!nextRightBlockEntry) {
    return undefined
  }

  const nextRightRect = nextRightBlockEntry.block.rect
  if (nextRightRect.y < bodyTop + 0.14 || nextRightRect.y > 0.72) {
    return undefined
  }

  const inferredRect = {
    x: nextRightRect.x,
    y: bodyTop,
    width: nextRightRect.width,
    height: Math.max(0, nextRightRect.y - bodyTop - 0.004)
  }

  if (inferredRect.height < 0.08 || inferredRect.width < 0.25) {
    return undefined
  }

  if (hasMineruContentInRect(pageBlocks, inferredRect, new Set([index, nextRightBlockEntry.index]))) {
    return undefined
  }

  const baselineDensity = getMineruPageTextDensity(pageBlocks)
  const blockDensity = getMineruBlockTextDensity(block)
  const combinedDensity =
    getMineruBlockTextLength(block) / Math.max(0.001, getMineruRectArea(block.rect) + getMineruRectArea(inferredRect))

  if (blockDensity < baselineDensity * 1.45 || combinedDensity > baselineDensity * 1.32) {
    return undefined
  }

  return {
    pageNo: block.pageNo,
    rect: inferredRect
  }
}

function inferMineruNextPageCrossPageSegment(
  block: MineruParseBlock,
  pageBlocks: MineruBlockEntry[],
  nextPageBlocks: MineruBlockEntry[]
): MineruBlockSegment | undefined {
  if (!isMineruCrossPageCandidate(block, pageBlocks)) {
    return undefined
  }

  const nextLeftBlockEntry = nextPageBlocks
    .filter((entry) => isReadableMineruTextBlock(entry.block) && isLeftColumnMineruRect(entry.block.rect))
    .sort((left, right) => left.block.rect.y - right.block.rect.y)[0]

  if (!nextLeftBlockEntry) {
    return undefined
  }

  const nextLeftRect = nextLeftBlockEntry.block.rect
  if (nextLeftRect.y < 0.28 || nextLeftRect.y > 0.9) {
    return undefined
  }

  const baselineDensity = Math.min(getMineruPageTextDensity(pageBlocks), getMineruPageTextDensity(nextPageBlocks))
  const textLength = getMineruBlockTextLength(block)
  const expectedTotalArea = textLength / Math.max(1, baselineDensity)
  const expectedExtraArea = expectedTotalArea - getMineruRectArea(block.rect)
  const maxBottom = nextLeftRect.y - 0.004
  const minTop = Math.max(0.08, getMineruColumnContentBottomBefore(nextPageBlocks, nextLeftRect, nextLeftRect.y) + 0.012)
  const inferredHeight = expectedExtraArea / Math.max(0.001, nextLeftRect.width)
  const inferredTop = clampNumber(maxBottom - inferredHeight, minTop, maxBottom - 0.08, minTop)

  const inferredRect = {
    x: nextLeftRect.x,
    y: inferredTop,
    width: nextLeftRect.width,
    height: Math.max(0, maxBottom - inferredTop)
  }

  if (inferredRect.height < 0.08 || inferredRect.height > 0.55 || inferredRect.width < 0.25) {
    return undefined
  }

  if (hasMineruContentInRect(nextPageBlocks, inferredRect, new Set())) {
    return undefined
  }

  const combinedDensity =
    textLength / Math.max(0.001, getMineruRectArea(block.rect) + getMineruRectArea(inferredRect))

  if (combinedDensity > baselineDensity * 1.35 || combinedDensity < baselineDensity * 0.72) {
    return undefined
  }

  return {
    pageNo: block.pageNo + 1,
    rect: inferredRect
  }
}

function isMineruCrossColumnCandidate(block: MineruParseBlock): boolean {
  const textLength = getMineruBlockTextLength(block)
  return (
    block.type === 'paragraph' &&
    textLength >= 800 &&
    isLeftColumnMineruRect(block.rect) &&
    block.rect.y >= 0.42 &&
    block.rect.y + block.rect.height >= 0.82
  )
}

function isMineruCrossPageCandidate(block: MineruParseBlock, pageBlocks: MineruBlockEntry[]): boolean {
  const textLength = getMineruBlockTextLength(block)
  const baselineDensity = getMineruPageTextDensity(pageBlocks)
  return (
    block.type === 'paragraph' &&
    textLength >= 1000 &&
    isRightColumnMineruRect(block.rect) &&
    block.rect.y >= 0.62 &&
    block.rect.y + block.rect.height >= 0.86 &&
    getMineruBlockTextDensity(block) >= baselineDensity * 1.75
  )
}

function isReadableMineruTextBlock(block: MineruParseBlock): boolean {
  return (
    (block.type === 'paragraph' || block.type === 'heading' || block.type === 'list') &&
    getMineruBlockTextLength(block) > 0 &&
    block.rect.width > 0 &&
    block.rect.height > 0
  )
}

function cleanGitHubRepositoryPathSegment(segment: string): string {
  return segment
    .replace(/^[^A-Za-z0-9]+/g, '')
    .replace(/[.,;:!?\u3001\u3002\uff0c\uff1b\uff1a]+$/g, '')
    .replace(/[^A-Za-z0-9_.-]+$/g, '')
}

function isValidGitHubRepositoryPathSegment(segment: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(segment) && !segment.startsWith('.') && !segment.endsWith('.')
}

function isLeftColumnMineruRect(rect: MineruRect): boolean {
  return rect.x <= 0.25 && rect.width >= 0.28 && rect.width <= 0.5 && rect.x + rect.width <= 0.58
}

function isRightColumnMineruRect(rect: MineruRect): boolean {
  return rect.x >= 0.45 && rect.width >= 0.28 && rect.width <= 0.5 && rect.x + rect.width >= 0.72
}

function getMineruPageBodyTop(pageBlocks: MineruBlockEntry[]): number {
  const top = pageBlocks
    .map((entry) => entry.block.rect)
    .filter((rect) => rect.y >= 0.04 && rect.y <= 0.36 && rect.width >= 0.18 && rect.height >= 0.02)
    .map((rect) => rect.y)
    .sort((left, right) => left - right)[0]

  return clampNumber(typeof top === 'number' ? top : 0.08, 0.06, 0.24, 0.08)
}

function hasMineruContentInRect(pageBlocks: MineruBlockEntry[], rect: MineruRect, excludedIndexes: Set<number>): boolean {
  return pageBlocks.some((entry) => {
    if (excludedIndexes.has(entry.index)) {
      return false
    }

    const candidateRect = entry.block.rect
    return getMineruRectHorizontalOverlap(candidateRect, rect) > 0.04 && getMineruRectVerticalOverlap(candidateRect, rect) > 0.02
  })
}

function getMineruColumnContentBottomBefore(pageBlocks: MineruBlockEntry[], columnRect: MineruRect, beforeY: number): number {
  const bottom = pageBlocks
    .map((entry) => entry.block.rect)
    .filter((rect) => rect.y < beforeY && getMineruRectHorizontalOverlap(rect, columnRect) > 0.08)
    .map((rect) => rect.y + rect.height)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0]

  return typeof bottom === 'number' ? bottom : 0.08
}

function getMineruPageTextDensity(pageBlocks: MineruBlockEntry[]): number {
  const densities = pageBlocks
    .map((entry) => entry.block)
    .filter((block) => isReadableMineruTextBlock(block) && block.rect.width >= 0.28 && block.rect.height >= 0.05)
    .map(getMineruBlockTextDensity)
    .filter((density) => Number.isFinite(density) && density > 0)
    .sort((left, right) => left - right)

  if (densities.length === 0) {
    return 10000
  }

  const middleIndex = Math.floor(densities.length / 2)
  const median =
    densities.length % 2 === 0
      ? ((densities[middleIndex - 1] ?? densities[middleIndex]) + densities[middleIndex]) / 2
      : densities[middleIndex]

  return clampNumber(median, 6500, 14000, 10000)
}

function getMineruBlockTextDensity(block: MineruParseBlock): number {
  return getMineruBlockTextLength(block) / Math.max(0.001, getMineruRectArea(block.rect))
}

function getMineruBlockTextLength(block: MineruParseBlock): number {
  return (block.text ?? block.caption ?? '').replace(/\s+/g, ' ').trim().length
}

function getMineruRectArea(rect: MineruRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height)
}

function getMineruRectHorizontalOverlap(left: MineruRect, right: MineruRect): number {
  return Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
}

function getMineruRectVerticalOverlap(left: MineruRect, right: MineruRect): number {
  return Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
}

function uniqueMineruSegments(segments: MineruBlockSegment[]): MineruBlockSegment[] {
  const seen = new Set<string>()

  return segments.filter((segment) => {
    const key = [
      segment.pageNo,
      segment.rect.x.toFixed(3),
      segment.rect.y.toFixed(3),
      segment.rect.width.toFixed(3),
      segment.rect.height.toFixed(3)
    ].join(':')
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
}

export type SourceRefType =
  | 'paper'
  | 'page'
  | 'annotation'
  | 'pdf_selection'
  | 'screenshot'
  | 'formula'
  | 'ai_message'
  | 'reference'
  | 'zotero_item'
  | 'note'
  | 'note_block'

export type SourceRef = {
  type: SourceRefType
  paperId?: EntityId
  noteId?: EntityId
  noteBlockId?: EntityId
  mineruBlockId?: EntityId
  sourceLinkStatus?: 'valid' | 'invalidated'
  pageNo?: number
  annotationId?: EntityId
  messageId?: EntityId
  referenceId?: EntityId
  zoteroItemKey?: string
  rect?: {
    x: number
    y: number
    width: number
    height: number
  }
  textHash?: string
  quote?: string
}

export type SelectionIntentKind = 'word' | 'phrase' | 'sentence' | 'paragraph'

export type SelectionExplainRoute = 'dictionary' | 'translation' | 'fallback'

export type SelectionIntent = {
  kind: SelectionIntentKind
  route: 'dictionary' | 'translation'
  tokenCount: number
  confidence: number
  reason: string
}

export type DictionarySense = {
  id?: EntityId
  pos?: string
  zh: string
  en?: string
  domain?: string
  examples?: string[]
}

export type DictionaryPhrase = {
  phrase: string
  translation: string
  note?: string
  confidence?: number
}

export type DictionaryEntry = {
  query: string
  lemma: string
  pos?: string
  phonetic?: string
  senses: DictionarySense[]
  phrases: DictionaryPhrase[]
  confidence: number
  source?: string
}

export type SelectionExplainAiSettings = {
  providerId: string
  baseUrl: string
  model: string
  reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  disableResponseStorage: boolean
  requiresOpenAiAuth: boolean
  apiKey?: string
}

export type SelectionExplainRequest = {
  text: string
  paperPath?: string
  pageNo?: number
  sourceRef?: SourceRef
  targetLanguage?: 'zh-CN' | string
  dictionaryEnabled?: boolean
  ai?: SelectionExplainAiSettings
}

export type SelectionTranslationResult = {
  sourceText: string
  targetText: string
  targetLanguage: string
  model?: string
}

export type SelectionExplainResult = {
  route: SelectionExplainRoute
  intent: SelectionIntent
  normalizedText: string
  dictionary?: DictionaryEntry
  translation?: SelectionTranslationResult
  fallbackReason?: string
  cached: boolean
}

export type BatchTranslationItem = {
  id: EntityId
  label?: string
  text: string
}

export type BatchTranslationRequest = {
  items: BatchTranslationItem[]
  targetLanguage?: 'zh-CN' | string
  ai?: SelectionExplainAiSettings
}

export type BatchTranslationResultItem = {
  id: EntityId
  targetText: string
}

export type BatchTranslationResult = {
  items: BatchTranslationResultItem[]
  targetLanguage: string
  model?: string
  rawText?: string
}

export type DeckSourceType = 'paper' | 'note' | 'selection' | 'conversation'

export type DeckAudience = 'self-study' | 'group-meeting' | 'class-report' | 'thesis-defense'

export type DeckLanguage = 'zh-CN' | 'en-US'

export type DeckTone = 'academic' | 'briefing' | 'teaching'

export type DeckIntent = {
  sourceType: DeckSourceType
  sourceIds: EntityId[]
  audience: DeckAudience
  language: DeckLanguage
  tone: DeckTone
  targetSlideCount: number
  templateId?: string
  includeReferences: boolean
  includeAgenda: boolean
  includeAppendix: boolean
}

export type SlideKind =
  | 'cover'
  | 'agenda'
  | 'section'
  | 'bullet'
  | 'two-column'
  | 'figure'
  | 'table'
  | 'quote'
  | 'comparison'
  | 'timeline'
  | 'references'
  | 'appendix'

export type SlideElementSpec =
  | {
      type: 'text'
      text: string
      style?: 'body' | 'caption' | 'muted' | 'code'
      sourceRefs?: SourceRef[]
    }
  | {
      type: 'bullet-list'
      items: string[]
      style?: 'body' | 'caption' | 'muted'
      sourceRefs?: SourceRef[]
    }
  | {
      type: 'image'
      assetId: EntityId
      caption?: string
      sourceRefs?: SourceRef[]
    }
  | {
      type: 'table'
      columns: string[]
      rows: string[][]
      sourceRefs?: SourceRef[]
    }
  | {
      type: 'quote'
      text: string
      citationId?: EntityId
      sourceRefs?: SourceRef[]
    }
  | {
      type: 'formula'
      latex: string
      displayMode?: boolean
      sourceRefs?: SourceRef[]
    }
  | {
      type: 'diagram'
      diagramKind: 'mermaid' | 'graphviz'
      source: string
      sourceRefs?: SourceRef[]
    }

export type SlideAssetKind = 'image' | 'screenshot' | 'formula-render' | 'diagram-render'

export type SlideAssetRef = {
  id: EntityId
  kind: SlideAssetKind
  mimeType?: string
  uri?: string
  width?: number
  height?: number
  alt?: string
  sourceRefs: SourceRef[]
}

export type DeckCitationRef = {
  id: EntityId
  title: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  url?: string
  sourceRefs: SourceRef[]
}

export type SlideSpec = {
  id: EntityId
  kind: SlideKind
  title: string
  notes?: string
  elements: SlideElementSpec[]
  sourceRefs: SourceRef[]
}

export type DeckSpec = {
  title: string
  subtitle?: string
  themeId: string
  language: DeckLanguage
  audience: DeckAudience | string
  slides: SlideSpec[]
  assets: SlideAssetRef[]
  citations: DeckCitationRef[]
  meta: {
    generatedAt: string
    sourceIds: EntityId[]
    generatorVersion: string
  }
}

export type PptExportJobStatus =
  | 'queued'
  | 'collecting'
  | 'outlining'
  | 'drafting'
  | 'rendering-assets'
  | 'auditing'
  | 'exporting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type PptExportJob = {
  id: EntityId
  sourceType: DeckSourceType
  sourceIds: EntityId[]
  intent: DeckIntent
  deckSpec?: DeckSpec
  themeId: string
  status: PptExportJobStatus
  progressMessage?: string
  outputFilePath?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export type PptThemeConfig = {
  id: string
  name: string
  fonts: {
    heading: string
    body: string
    code: string
  }
  colors: {
    background: string
    surface: string
    textPrimary: string
    textSecondary: string
    accent: string
    muted: string
    warning: string
  }
}

export type PptAuditIssue = {
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  slideId?: EntityId
  assetId?: EntityId
}

export type PptExportResult = {
  ok: boolean
  outputPath?: string
  slideCount: number
  auditIssues: PptAuditIssue[]
  errorCode?: string
  message?: string
}

export type PaperSummary = {
  id: EntityId
  title: string
  authors: string[]
  year?: number
  filePath: string
  fingerprint?: string
}

export type AppResource =
  | {
      type: 'paper-pdf'
      paperId: EntityId
      filePath: string
    }
  | {
      type: 'note'
      noteId: EntityId
    }
  | {
      type: 'paper-graph'
      paperId: EntityId
    }
  | {
      type: 'settings'
      section?: string
    }

export type Result<TValue, TError = Error> =
  | {
      ok: true
      value: TValue
    }
  | {
      ok: false
      error: TError
    }

export function createId(prefix = 'id'): EntityId {
  const randomId =
    globalThis.crypto && 'randomUUID' in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2)

  return `${prefix}_${randomId}`
}
