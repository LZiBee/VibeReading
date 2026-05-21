import { countNoteTextCharacters } from '@thesis-agent/notes'
import type { NoteDocument } from '@thesis-agent/notes'
import type { PersistedPdfViewState } from '../../preload/thesis-agent'
import type {
  AiConversation,
  AiConversationsByPaperPath,
  ChatMessage,
  ChatTurn,
  FavoriteItem,
  FavoriteItemsByKey,
  FavoriteTarget,
  LibrarySortMode,
  NotesByPaperPath,
  OpenNoteIdsByPaperPath,
  PdfDisplayNamesByPath,
  PdfFileInfoByPath,
  PdfViewStates,
  ProfileActivityCell,
  ProfileNoteSummary,
  ProfileReadingItem,
  ResolvedFavoriteItem,
  SelectedNoteIdsByPaperPath
} from './types'

export function getMessagePreview(content: string, maxLength = 24): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '空消息'
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}…` : normalized
}

export function getAiConversationScopedMessages(conversation: AiConversation): ChatMessage[] {
  if (!conversation.parentAnswerId) {
    return conversation.messages
  }

  const parentAnswerIndex = conversation.messages.findIndex((message) => message.id === conversation.parentAnswerId)
  return parentAnswerIndex >= 0 ? conversation.messages.slice(parentAnswerIndex + 1) : conversation.messages
}

export function getAiConversationQuestionLabel(conversation: AiConversation, fallback = '新问题'): string {
  const firstVisibleUserMessage = getAiConversationScopedMessages(conversation).find(
    (message) => message.role === 'user' && message.content.trim()
  )

  if (firstVisibleUserMessage) {
    return getMessagePreview(firstVisibleUserMessage.content, 28)
  }

  return fallback
}

export function getAiConversationDisplayTitle(conversation: AiConversation, fallback = '新对话'): string {
  const normalizedTitle = conversation.title?.trim()

  if (normalizedTitle && !isLikelyMojibakeText(normalizedTitle)) {
    return normalizedTitle
  }

  return getAiConversationQuestionLabel(conversation, fallback)
}

export function findAiConversationById(
  conversationsByPaperPath: AiConversationsByPaperPath,
  conversationId: string
): AiConversation | undefined {
  return Object.values(conversationsByPaperPath)
    .flat()
    .find((conversation) => conversation.id === conversationId)
}

export function getAssistantProcessLabel(message: ChatMessage): string {
  if (message.status === 'sending') {
    return '正在生成回答...'
  }

  if (message.status === 'error') {
    return '回答失败'
  }

  if (typeof message.durationMs === 'number' && Number.isFinite(message.durationMs)) {
    return `已完成 · ${formatDuration(message.durationMs)}`
  }

  return '已完成'
}

function isLikelyMojibakeText(content: string): boolean {
  const normalized = content.trim()
  if (!normalized) {
    return false
  }

  const suspiciousMatches = normalized.match(/[鍚鍙鍓鍔鍖鍘鍥鍫鍬鍭鎴鎵鏀鏂鏃鏄鏉鏋鏃闂闃闄閱鑰璁绗缁缂缁锛銆鈥瀵瀛娈棰寰淇楂绛姝鍐鏍鎻鍊]/g)
  return (suspiciousMatches?.length ?? 0) >= 2
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))

  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`
}

export function formatUpdatedAt(updatedAt: string): string {
  const timestamp = Date.parse(updatedAt)
  if (!Number.isFinite(timestamp)) {
    return '刚刚更新'
  }

  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

export function getFileStem(filePath: string): string {
  return getFileName(filePath).replace(/\.pdf$/i, '')
}

export function getPdfDisplayName(filePath: string, pdfDisplayNamesByPath: PdfDisplayNamesByPath): string {
  return pdfDisplayNamesByPath[filePath]?.trim() || getFileName(filePath)
}

export function getPdfProgressPercent(viewState?: PersistedPdfViewState): number {
  const pageCount = Math.max(0, Math.floor(viewState?.pageCount ?? 0))
  const pageNumber = Math.max(1, Math.floor(viewState?.pageNumber ?? 1))

  if (pageCount <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round((pageNumber / pageCount) * 100)))
}

export function getPdfProgressTooltip(viewState?: PersistedPdfViewState): string {
  const pageCount = Math.max(0, Math.floor(viewState?.pageCount ?? 0))
  const pageNumber = Math.max(1, Math.floor(viewState?.pageNumber ?? 1))
  const readingTime = formatReadingDuration(viewState?.readingSeconds ?? 0)

  if (pageCount <= 0) {
    return `阅读时间 ${readingTime}，进度待打开后统计`
  }

  const currentPage = Math.min(pageNumber, pageCount)
  const progress = getPdfProgressPercent(viewState)
  return `阅读时间 ${readingTime}，已看到第 ${currentPage} / ${pageCount} 页，进度 ${progress}%`
}

export function getPdfProgressHoverLabel(viewState?: PersistedPdfViewState): string {
  const pageCount = Math.max(0, Math.floor(viewState?.pageCount ?? 0))

  if (pageCount <= 0) {
    return '进度待统计'
  }

  const currentPage = Math.min(Math.max(1, Math.floor(viewState?.pageNumber ?? 1)), pageCount)
  const progress = getPdfProgressPercent(viewState)
  return `${currentPage} / ${pageCount} 页 · ${progress}%`
}

export function formatReadingDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / 60)

  if (minutes < 1) {
    return seconds > 0 ? '< 1 分钟' : '0 分钟'
  }

  if (minutes < 60) {
    return `${minutes} 分钟`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return remainingMinutes > 0 ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`
}

export function getProfileNoteSummaries(notesByPaperPath: NotesByPaperPath): ProfileNoteSummary[] {
  return Object.entries(normalizeNotesByPaperPath(notesByPaperPath))
    .flatMap(([paperPath, notes]) =>
      notes.map((note) => ({
        id: note.id,
        paperPath,
        title: note.title || `${getFileStem(paperPath)} Notes`,
        blockCount: note.blocks.length,
        characterCount: countNoteTextCharacters(note),
        updatedAt: note.updatedAt
      }))
    )
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function getProfileReadingItems(
  openPdfPaths: string[],
  selectedPdfPath: string,
  pdfViewStates: PdfViewStates
): ProfileReadingItem[] {
  return [...openPdfPaths]
    .sort((left, right) => {
      if (left === selectedPdfPath) {
        return -1
      }

      if (right === selectedPdfPath) {
        return 1
      }

      return getPdfRecentScore(right, openPdfPaths, pdfViewStates) - getPdfRecentScore(left, openPdfPaths, pdfViewStates)
    })
    .map((filePath) => {
      const viewState = pdfViewStates[filePath]
      return {
        filePath,
        title: getFileStem(filePath),
        progressPercent: getPdfProgressPercent(viewState),
        progressLabel: getPdfProgressHoverLabel(viewState),
        readingTime: formatReadingDuration(viewState?.readingSeconds ?? 0),
        updatedAt: viewState?.updatedAt ?? ''
      }
    })
}

export function getProfileActivityCells(
  notesByPaperPath: NotesByPaperPath,
  pdfViewStates: PdfViewStates
): ProfileActivityCell[] {
  const dayCount = 53 * 7
  const today = startOfLocalDay(new Date())
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - dayCount + 1)
  const countsByDate = new Map<string, number>()
  const addActivity = (dateText: string | undefined, weight = 1): void => {
    if (!dateText) {
      return
    }

    const timestamp = Date.parse(dateText)
    if (!Number.isFinite(timestamp)) {
      return
    }

    const key = formatDateKey(new Date(timestamp))
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + weight)
  }

  for (const notes of Object.values(normalizeNotesByPaperPath(notesByPaperPath))) {
    for (const note of notes) {
      addActivity(note.createdAt)
      addActivity(note.updatedAt, note.updatedAt === note.createdAt ? 0 : 1)
    }
  }

  for (const viewState of Object.values(pdfViewStates)) {
    addActivity(viewState.updatedAt)
  }

  return Array.from({ length: dayCount }, (_item, index) => {
    const currentDate = new Date(startDate)
    currentDate.setDate(startDate.getDate() + index)
    const date = formatDateKey(currentDate)
    const count = countsByDate.get(date) ?? 0

    return {
      date,
      count,
      level: getProfileActivityLevel(count)
    }
  })
}

function getProfileActivityLevel(count: number): number {
  if (count <= 0) {
    return 0
  }

  if (count <= 1) {
    return 1
  }

  if (count <= 3) {
    return 2
  }

  if (count <= 6) {
    return 3
  }

  return 4
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getPdfRecentScore(filePath: string, openPdfPaths: string[], pdfViewStates: PdfViewStates): number {
  const updatedAt = Date.parse(pdfViewStates[filePath]?.updatedAt ?? '')

  if (Number.isFinite(updatedAt)) {
    return updatedAt
  }

  return openPdfPaths.indexOf(filePath)
}

function getPdfReadingSeconds(filePath: string, pdfViewStates: PdfViewStates): number {
  return Math.max(0, pdfViewStates[filePath]?.readingSeconds ?? 0)
}

function getPdfRemainingProgressScore(filePath: string, pdfViewStates: PdfViewStates): number {
  return 100 - getPdfProgressPercent(pdfViewStates[filePath])
}

function getPdfDateScore(filePath: string, pdfViewStates: PdfViewStates, pdfFileInfoByPath: PdfFileInfoByPath): number {
  const modifiedAt = Date.parse(pdfFileInfoByPath[filePath]?.modifiedAt ?? '')
  if (Number.isFinite(modifiedAt)) {
    return modifiedAt
  }

  return getPdfRecentScore(filePath, [], pdfViewStates)
}

function getPdfSizeScore(filePath: string, pdfFileInfoByPath: PdfFileInfoByPath): number {
  return Math.max(0, pdfFileInfoByPath[filePath]?.size ?? 0)
}

export function sortPdfPaths(
  openPdfPaths: string[],
  selectedPdfPath: string,
  pdfViewStates: PdfViewStates,
  pdfFileInfoByPath: PdfFileInfoByPath,
  sortMode: LibrarySortMode
): string[] {
  return [...openPdfPaths].sort((left, right) => {
    const directionFactor = sortMode.direction === 'asc' ? 1 : -1
    let result = 0

    if (sortMode.field === 'name') {
      result = getFileName(left).localeCompare(getFileName(right), undefined, { sensitivity: 'base' })
    } else if (sortMode.field === 'readingTime') {
      result = getPdfReadingSeconds(left, pdfViewStates) - getPdfReadingSeconds(right, pdfViewStates)
    } else if (sortMode.field === 'progress') {
      result = getPdfRemainingProgressScore(left, pdfViewStates) - getPdfRemainingProgressScore(right, pdfViewStates)
    } else if (sortMode.field === 'date') {
      result = getPdfDateScore(left, pdfViewStates, pdfFileInfoByPath) - getPdfDateScore(right, pdfViewStates, pdfFileInfoByPath)
    } else if (sortMode.field === 'size') {
      result = getPdfSizeScore(left, pdfFileInfoByPath) - getPdfSizeScore(right, pdfFileInfoByPath)
    } else {
      result = getPdfRecentScore(left, openPdfPaths, pdfViewStates) - getPdfRecentScore(right, openPdfPaths, pdfViewStates)
    }

    if (result !== 0) {
      return result * directionFactor
    }

    if (left === selectedPdfPath) {
      return -1
    }

    if (right === selectedPdfPath) {
      return 1
    }

    return getFileName(left).localeCompare(getFileName(right), undefined, { sensitivity: 'base' })
  })
}

export function getChatTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  let currentTurn: ChatTurn | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      currentTurn = {
        id: message.id,
        question: message
      }
      turns.push(currentTurn)
      continue
    }

    if (currentTurn && !currentTurn.answer) {
      currentTurn.answer = message
      currentTurn = null
    }
  }

  return turns
}

function normalizeNotesByPaperPath(input: unknown): NotesByPaperPath {
  if (!isObjectRecord(input)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(input)
      .map(([filePath, notes]) => [filePath, normalizeNoteList(notes)] as const)
      .filter(([, notes]) => notes.length > 0)
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRestoredNoteDocument(value: unknown): value is NoteDocument {
  if (!isObjectRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.blocks) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function normalizeNoteList(input: unknown): NoteDocument[] {
  const rawNotes = Array.isArray(input) ? input : isRestoredNoteDocument(input) ? [input] : []
  return rawNotes.filter(isRestoredNoteDocument)
}

export function getPaperNotes(notesByPaperPath: NotesByPaperPath, filePath: string): NoteDocument[] {
  return normalizeNoteList((notesByPaperPath as Record<string, unknown>)[filePath])
}

function normalizeNoteIdList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  return [...new Set(input.filter((value): value is string => typeof value === 'string' && value.length > 0))].slice(0, 20)
}

export function getOpenNoteIdsForPaper(
  openNoteIdsByPaperPath: OpenNoteIdsByPaperPath,
  notesByPaperPath: NotesByPaperPath,
  filePath: string
): string[] {
  const noteIdSet = new Set(getPaperNotes(notesByPaperPath, filePath).map((note) => note.id))
  return normalizeNoteIdList((openNoteIdsByPaperPath as Record<string, unknown>)[filePath]).filter((noteId) => noteIdSet.has(noteId))
}

export function getSelectedOpenNoteIdForPaper(
  selectedNoteIdsByPaperPath: SelectedNoteIdsByPaperPath,
  openNoteIdsByPaperPath: OpenNoteIdsByPaperPath,
  notesByPaperPath: NotesByPaperPath,
  filePath: string
): string {
  const selectedNoteId = selectedNoteIdsByPaperPath[filePath] ?? ''
  const openNoteIds = getOpenNoteIdsForPaper(openNoteIdsByPaperPath, notesByPaperPath, filePath)

  if (selectedNoteId && openNoteIds.includes(selectedNoteId)) {
    return selectedNoteId
  }

  return openNoteIds[0] ?? ''
}

function getLatestConversationUpdatedAt(conversations: AiConversation[]): number {
  return conversations.reduce((latest, conversation) => Math.max(latest, Date.parse(conversation.updatedAt)), 0)
}

export function getFavoriteKey(target: FavoriteTarget): string {
  if (target.type === 'paper') {
    return `paper:${target.paperPath}`
  }

  if (target.type === 'note') {
    return `note:${target.paperPath}:${target.noteId}`
  }

  return `ai_answer:${target.paperPath}:${target.conversationId}:${target.messageId}`
}

export function isFavorite(favoriteItemsByKey: FavoriteItemsByKey, target: FavoriteTarget): boolean {
  return Boolean(favoriteItemsByKey[getFavoriteKey(target)])
}

export function normalizeFavoriteItemsByKey(input: unknown): FavoriteItemsByKey {
  const rawItems = Array.isArray(input) ? input : isObjectRecord(input) ? Object.values(input) : []
  const items = rawItems
    .map(normalizeFavoriteItem)
    .filter((item): item is FavoriteItem => Boolean(item))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 200)

  return Object.fromEntries(items.map((item) => [getFavoriteKey(item), item]))
}

function normalizeFavoriteItem(input: unknown): FavoriteItem | undefined {
  if (!isObjectRecord(input) || !isPdfFilePath(input.paperPath)) {
    return undefined
  }

  const createdAt = typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString()

  if (input.type === 'paper') {
    return {
      type: 'paper',
      paperPath: input.paperPath,
      createdAt
    }
  }

  if (input.type === 'note' && typeof input.noteId === 'string') {
    return {
      type: 'note',
      paperPath: input.paperPath,
      noteId: input.noteId,
      createdAt
    }
  }

  if (input.type === 'ai_answer' && typeof input.conversationId === 'string' && typeof input.messageId === 'string') {
    return {
      type: 'ai_answer',
      paperPath: input.paperPath,
      conversationId: input.conversationId,
      messageId: input.messageId,
      createdAt
    }
  }

  return undefined
}

export function pruneFavoriteItemsByKey(
  favoriteItemsByKey: FavoriteItemsByKey,
  notesByPaperPath: NotesByPaperPath,
  conversationsByPaperPath: AiConversationsByPaperPath
): FavoriteItemsByKey {
  const items = Object.values(normalizeFavoriteItemsByKey(favoriteItemsByKey))
    .filter((item) => isFavoriteItemAvailable(item, notesByPaperPath, conversationsByPaperPath))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 200)

  return Object.fromEntries(items.map((item) => [getFavoriteKey(item), item]))
}

function isFavoriteItemAvailable(
  item: FavoriteItem,
  notesByPaperPath: NotesByPaperPath,
  conversationsByPaperPath: AiConversationsByPaperPath
): boolean {
  if (item.type === 'paper') {
    return isPdfFilePath(item.paperPath)
  }

  if (item.type === 'note') {
    return getPaperNotes(notesByPaperPath, item.paperPath).some((note) => note.id === item.noteId)
  }

  const conversation = conversationsByPaperPath[item.paperPath]?.find((currentConversation) => currentConversation.id === item.conversationId)
  return Boolean(conversation?.messages.some((message) => message.id === item.messageId && message.role === 'assistant'))
}

function isPdfFilePath(input: unknown): input is string {
  return typeof input === 'string' && input.toLowerCase().endsWith('.pdf')
}

export function resolveFavoriteItem(
  key: string,
  item: FavoriteItem,
  pdfDisplayNamesByPath: PdfDisplayNamesByPath,
  notesByPaperPath: NotesByPaperPath,
  aiConversationsByPaperPath: AiConversationsByPaperPath
): ResolvedFavoriteItem | undefined {
  if (item.type === 'paper') {
    const displayName = getPdfDisplayName(item.paperPath, pdfDisplayNamesByPath)

    return {
      key,
      target: item,
      createdAt: item.createdAt,
      icon: 'codicon-file-pdf',
      typeLabel: '论文',
      title: displayName,
      subtitle: item.paperPath
    }
  }

  if (item.type === 'note') {
    const note = getPaperNotes(notesByPaperPath, item.paperPath).find((currentNote) => currentNote.id === item.noteId)
    if (!note) {
      return undefined
    }

    return {
      key,
      target: item,
      createdAt: item.createdAt,
      icon: 'codicon-notebook',
      typeLabel: '笔记',
      title: note.title || `${getFileStem(item.paperPath)} Notes`,
      subtitle: `${getPdfDisplayName(item.paperPath, pdfDisplayNamesByPath)} · ${note.blocks.length} 段 · ${countNoteTextCharacters(note)} 字`
    }
  }

  const conversation = findAiConversationById(aiConversationsByPaperPath, item.conversationId)
  if (!conversation) {
    return undefined
  }

  const turn = getChatTurns(conversation.messages).find((currentTurn) => currentTurn.answer?.id === item.messageId)
  const answer = turn?.answer ?? conversation.messages.find((message) => message.id === item.messageId)
  if (!answer) {
    return undefined
  }

  return {
    key,
    target: item,
    createdAt: item.createdAt,
    icon: 'codicon-comment-discussion',
    typeLabel: 'AI 回答',
    title: getMessagePreview(answer.content || 'AI 回答', 32),
    subtitle: `${getPdfDisplayName(item.paperPath, pdfDisplayNamesByPath)} · ${getMessagePreview(turn?.question.content ?? conversation.title, 34)}`
  }
}
