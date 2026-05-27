import type {
  DeckAudience,
  DeckIntent,
  DeckLanguage,
  DeckSpec,
  DeckTone,
  EntityId,
  SlideAssetRef,
  SlideKind,
  SourceRef
} from '@thesis-agent/shared'

export type PptPaperMaterial = {
  id: EntityId
  title: string
  authors?: string[]
  year?: number
  abstract?: string
  keywords?: string[]
  sourceRefs?: SourceRef[]
}

export type PptTextMaterial = {
  id: EntityId
  title?: string
  text: string
  sourceRefs: SourceRef[]
}

export type PptReferenceMaterial = {
  id: EntityId
  title: string
  authors?: string[]
  year?: number
  venue?: string
  doi?: string
  url?: string
  sourceRefs: SourceRef[]
}

export type PptDeckMaterials = {
  paper?: PptPaperMaterial
  excerpts?: PptTextMaterial[]
  notes?: PptTextMaterial[]
  aiAnswers?: PptTextMaterial[]
  references?: PptReferenceMaterial[]
  assets?: SlideAssetRef[]
}

export type GenerateDeckSpecInput = {
  intent?: Partial<DeckIntent>
  materials: PptDeckMaterials
  now?: string
  generatorVersion?: string
}

export type GenerateDeckSpecResult = {
  intent: DeckIntent
  deck: DeckSpec
  warnings: string[]
}

export type GenerateDeckSpecFromAiDraftJsonInput = GenerateDeckSpecInput & {
  aiOutput: string
}

export type PptEvidenceKind = 'paper' | 'excerpt' | 'note' | 'ai'

export type PptEvidenceItem = {
  id: EntityId
  title: string
  text: string
  normalizedText: string
  sourceRefs: SourceRef[]
  kind: PptEvidenceKind
  pageNo?: number
  score: number
}

export type DigestConfidence = 'high' | 'medium' | 'low'

export type DigestPoint = {
  text: string
  evidenceRefs: SourceRef[]
  confidence: DigestConfidence
}

export type DigestTerm = {
  term: string
  explanation: string
  evidenceRefs: SourceRef[]
}

export type DigestFigure = {
  assetId: EntityId
  caption: string
  evidenceRefs: SourceRef[]
}

export type DigestTable = {
  title: string
  summary: string
  evidenceRefs: SourceRef[]
}

export type PaperDigest = {
  paperId: EntityId
  title: string
  oneSentenceSummary: string
  researchProblem: DigestPoint[]
  motivation: DigestPoint[]
  method: DigestPoint[]
  experiments: DigestPoint[]
  findings: DigestPoint[]
  limitations: DigestPoint[]
  terms: DigestTerm[]
  figures: DigestFigure[]
  tables: DigestTable[]
}

export type PlannedSlideKind =
  | 'cover'
  | 'agenda'
  | 'background'
  | 'problem'
  | 'method'
  | 'experiment'
  | 'finding'
  | 'discussion'
  | 'conclusion'
  | 'references'
  | 'appendix'

export type PlannedSlide = {
  id: EntityId
  kind: PlannedSlideKind
  title: string
  goal: string
  keyMessage: string
  evidenceRefs: SourceRef[]
  visualSuggestion?: string
}

export type SlidePlan = {
  title: string
  audience: DeckAudience
  language: DeckLanguage
  slides: PlannedSlide[]
}

export type SlideDraft = {
  slideId: EntityId
  planKind: PlannedSlideKind
  slideKind: SlideKind
  title: string
  subtitle?: string
  bullets: string[]
  speakerNotes: string
  sourceRefs: SourceRef[]
  visual?: {
    kind: 'figure' | 'table' | 'diagram' | 'none'
    assetId?: EntityId
    caption?: string
    diagramKind?: 'mermaid' | 'graphviz'
    source?: string
  }
}

export type DeckContentQualityIssue = {
  severity: 'error' | 'warning' | 'info'
  slideId?: EntityId
  code:
    | 'duplicate_text'
    | 'raw_pdf_noise'
    | 'weak_bullet'
    | 'missing_source'
    | 'too_many_bullets'
    | 'title_too_long'
    | 'low_information_density'
  message: string
}

export type PptDeckPipelineState = {
  evidenceItems: PptEvidenceItem[]
  digest: PaperDigest
  plan: SlidePlan
  drafts: SlideDraft[]
  issues: DeckContentQualityIssue[]
}

export type PptDeckAudienceValues = DeckAudience[]
export type PptDeckLanguageValues = DeckLanguage[]
export type PptDeckToneValues = DeckTone[]
