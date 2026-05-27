import type { NoteBlockType } from '@thesis-agent/notes'
import type {
  PersistedAiSettingsState,
  PersistedPdfEditorSettingsState,
  PersistedPptGenerationSettingsState,
  PersistedTranslationSettingsState,
  PersistedMineruSettingsState,
  PersistedNoteEditorEngine
} from '../../preload/thesis-agent'
import type { LibrarySortDirection, LibrarySortField, PrimaryView } from './types'

export const activityItems: Array<{
  id: PrimaryView
  icon: string
  title: string
}> = [
  { id: 'library', icon: 'codicon-library', title: 'Library' },
  { id: 'favorites', icon: 'codicon-star-full', title: 'Favorites' },
  { id: 'note', icon: 'codicon-notebook', title: 'Notes' },
  { id: 'graph', icon: 'codicon-type-hierarchy-sub', title: 'Graph' }
]

export const profileDisplayName = 'LZiBee'

export const defaultLibrarySortState = {
  field: 'recent',
  direction: 'desc'
} as const

export const librarySortFieldOptions: Array<{
  id: LibrarySortField
  title: string
}> = [
  { id: 'readingTime', title: '阅读时长' },
  { id: 'recent', title: '最近阅读' },
  { id: 'progress', title: '剩余进度' },
  { id: 'date', title: '日期' },
  { id: 'name', title: '名称' },
  { id: 'size', title: '大小' }
]

export const librarySortDirectionOptions: Array<{
  id: LibrarySortDirection
  title: string
}> = [
  { id: 'asc', title: '递增' },
  { id: 'desc', title: '递减' }
]

export const noteBlockTypeOptions: Array<{
  id: NoteBlockType
  title: string
  icon: string
}> = [
  { id: 'paragraph', title: '段落', icon: 'codicon-symbol-text' },
  { id: 'heading', title: '标题', icon: 'codicon-symbol-key' },
  { id: 'quote', title: '引用', icon: 'codicon-quote' },
  { id: 'todo', title: '待办', icon: 'codicon-checklist' },
  { id: 'pdf_excerpt', title: '摘录', icon: 'codicon-file-pdf' },
  { id: 'ai_answer', title: 'AI', icon: 'codicon-sparkle' },
  { id: 'formula', title: '公式', icon: 'codicon-symbol-operator' },
  { id: 'image', title: '图片', icon: 'codicon-file-media' },
  { id: 'screenshot', title: '截图', icon: 'codicon-preview' },
  { id: 'table', title: '表格', icon: 'codicon-table' },
  { id: 'reference', title: '文献', icon: 'codicon-references' },
  { id: 'question_node', title: '问题', icon: 'codicon-question' }
]

export const defaultSystemPrompt =
  'You are Inspiration, a careful research paper reading assistant. Answer clearly and cite paper evidence when context is provided.'

export const pdfjsResourceBaseUrl = new URL('pdfjs/', window.location.href).toString()
export const aiContextMaxExtractedPages = 35
export const aiContextCurrentPageRadius = 1
export const aiContextPaperTextMaxChars = 36000
export const aiContextCurrentPageTextMaxChars = 14000
export const aiContextNotesMaxChars = 16000
export const aiContextMaxNotes = 8

export const defaultAiSettings: PersistedAiSettingsState = {
  providerId: 'my_codex',
  baseUrl: 'https://geekspace.cloud/v1',
  model: 'gpt-5.5',
  reasoningEffort: 'xhigh',
  disableResponseStorage: true,
  requiresOpenAiAuth: true,
  systemPrompt: defaultSystemPrompt,
  apiKey: ''
}

export const defaultTranslationSettings: PersistedTranslationSettingsState = {
  targetLanguage: 'zh-CN',
  dictionaryEnabled: true,
  fullTextBatchSize: 5,
  ai: {
    ...defaultAiSettings,
    model: 'gpt-5.4',
    reasoningEffort: 'low'
  }
}

export const defaultPptAiSettings: PersistedAiSettingsState = {
  ...defaultAiSettings,
  model: 'gpt-5.5',
  reasoningEffort: 'xhigh'
}

export const defaultPptGenerationSettings: PersistedPptGenerationSettingsState = {
  targetSlideCount: 10,
  includeAgenda: true,
  includeReferences: true,
  includeAppendix: false,
  includeNotes: true,
  includeAiAnswers: true
}

export const defaultPdfEditorSettings: PersistedPdfEditorSettingsState = {
  defaultTool: 'select',
  defaultBrowseMode: 'page',
  defaultRenderMode: 'compatibility',
  defaultScale: 1,
  showSelectionPopover: true
}

export const defaultMineruSettings: PersistedMineruSettingsState = {
  apiKey: '',
  modelVersion: 'vlm',
  language: 'en',
  enableTable: true,
  enableFormula: true,
  isOcr: false,
  autoClean: true,
  pageRange: '',
  sourceUrl: '',
  noteStyle: {
    fontFamily: '',
    fontSize: 14,
    bold: false,
    italic: false,
    highlight: '#dff1ff'
  }
}

export const defaultNoteEditorEngine: PersistedNoteEditorEngine = 'milkdown'

export const modelOptions = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2']
export const aiComposerMinHeight = 164
export const aiComposerDefaultHeight = 210
