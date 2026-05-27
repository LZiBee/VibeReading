import type { ReactElement } from 'react'
import type { PersistedMineruSettingsState, PersistedPdfEditorSettingsState, PersistedPdfViewState } from '../../../preload/thesis-agent'
import type { MineruParseResult, SelectionExplainResult } from '@thesis-agent/shared'
import type {
  AiConversation,
  AiGraphSelectTarget,
  EditorTab,
  PaperMindmapDocument,
  PdfLinkedNoteRegion,
  PdfViewStates
} from '../../app/types'
import { PdfViewer, pdfRendererCacheKey } from '../PdfViewer'
import type { PdfPptReasoningOption, PdfPptToolbarSettings, PdfViewerToolbarBridge } from '../PdfViewer'
import type { PdfSelectionSnapshot } from '../pdfviewer/pdfViewerShared'
import { AiQuestionMapCanvas } from '../graph/AiQuestionMapCanvas'
import { MarkmapMindmapViewer } from '../mindmap/MarkmapMindmapViewer'
import type { MindmapNodeJumpTarget } from '../mindmap/MarkmapMindmapViewer'

export function EditorContent({
  activeEditor,
  openPdfPaths,
  selectedPdfPath,
  currentGraphPaperPath,
  currentGraphPaperTitle,
  currentMindmap,
  currentMindmapPaperTitle,
  isMindmapGenerating,
  mindmapWarnings,
  graphConversations,
  activeGraphConversationId,
  focusedAiMessageId,
  pdfViewStates,
  focusedPdfSourceRegion,
  focusedPdfSourceRegionNonce,
  onOpenPdf,
  onStatus,
  onAiGraphNodeSelect,
  onMindmapGenerate,
  onAskSelection,
  onExplainSelection,
  onCreatePdfNote,
  onParseWithMineru,
  onGenerateMineruNote,
  onOpenFullTranslation,
  onHideMineruLinkedRegions,
  onShowMineruLinkedRegions,
  onMineruClearCurrentCache,
  onMineruClearAllCaches,
  onPdfViewStateChange,
  onPdfToolbarChange,
  pptSettings,
  pptModelOptions,
  pptReasoningOptions,
  pdfEditorSettings,
  isPptGenerating,
  onPptSettingsChange,
  onGeneratePpt,
  mineruSettings,
  onMineruSettingsChange,
  mineruParseResultByPdfPath,
  hiddenMineruOverlayByPdfPath,
  linkedNoteRegions,
  onLinkedNoteRegionSelect,
  onMindmapNodeJump
}: {
  activeEditor: EditorTab
  openPdfPaths: string[]
  selectedPdfPath: string
  currentGraphPaperPath: string
  currentGraphPaperTitle: string
  currentMindmap?: PaperMindmapDocument
  currentMindmapPaperTitle: string
  isMindmapGenerating: boolean
  mindmapWarnings: string[]
  graphConversations: AiConversation[]
  activeGraphConversationId: string
  focusedAiMessageId: string
  pdfViewStates: PdfViewStates
  focusedPdfSourceRegion?: PdfLinkedNoteRegion | null
  focusedPdfSourceRegionNonce: number
  onOpenPdf: () => void
  onStatus: (status: string) => void
  onAiGraphNodeSelect: (target: AiGraphSelectTarget) => void
  onMindmapGenerate: () => void
  onAskSelection: (filePath: string, selection: PdfSelectionSnapshot) => void
  onExplainSelection: (filePath: string, selection: PdfSelectionSnapshot) => Promise<SelectionExplainResult>
  onCreatePdfNote: (filePath: string) => void
  onParseWithMineru: (filePath: string) => void
  onGenerateMineruNote: (filePath: string) => void
  onOpenFullTranslation: (filePath: string) => void
  onHideMineruLinkedRegions: (filePath: string) => void
  onShowMineruLinkedRegions: (filePath: string) => void
  onMineruClearCurrentCache: (filePath: string) => void
  onMineruClearAllCaches: () => void
  onPdfViewStateChange: (filePath: string, viewState: PersistedPdfViewState) => void
  onPdfToolbarChange: (toolbar: PdfViewerToolbarBridge | null) => void
  pptSettings: PdfPptToolbarSettings
  pptModelOptions: string[]
  pptReasoningOptions: PdfPptReasoningOption[]
  pdfEditorSettings: PersistedPdfEditorSettingsState
  isPptGenerating: boolean
  onPptSettingsChange: (patch: Partial<PdfPptToolbarSettings>) => void
  onGeneratePpt: (filePath: string) => void
  mineruSettings: PersistedMineruSettingsState
  onMineruSettingsChange: (patch: Partial<PersistedMineruSettingsState>) => void
  mineruParseResultByPdfPath: Record<string, MineruParseResult>
  hiddenMineruOverlayByPdfPath: Record<string, boolean>
  linkedNoteRegions: PdfLinkedNoteRegion[]
  onLinkedNoteRegionSelect: (region: PdfLinkedNoteRegion) => void
  onMindmapNodeJump: (target: MindmapNodeJumpTarget) => void
}): ReactElement {
  const visiblePdfPath = selectedPdfPath && openPdfPaths.includes(selectedPdfPath) ? selectedPdfPath : openPdfPaths[0] ?? ''

  return (
    <div className="editor-content-cache">
      <div className={activeEditor === 'pdf' ? 'editor-mode-cache pdf active' : 'editor-mode-cache pdf'}>
        {openPdfPaths.length > 0 ? (
          openPdfPaths.map((filePath) => {
            const isVisible = activeEditor === 'pdf' && filePath === visiblePdfPath

            return (
              <div key={`${filePath}:${pdfRendererCacheKey}`} className={isVisible ? 'pdf-viewer-cache-slot active' : 'pdf-viewer-cache-slot'}>
                <PdfViewer
                  filePath={filePath}
                  session={pdfViewStates[filePath]}
                  isActive={isVisible}
                  onOpenPdf={onOpenPdf}
                  onStatus={onStatus}
                  onAskSelection={(selection) => onAskSelection(filePath, selection)}
                  onExplainSelection={(selection) => onExplainSelection(filePath, selection)}
                  onCreatePdfNote={() => onCreatePdfNote(filePath)}
                  onParseWithMineru={() => onParseWithMineru(filePath)}
                  onGenerateMineruNote={() => onGenerateMineruNote(filePath)}
                  onOpenFullTranslation={() => onOpenFullTranslation(filePath)}
                  onHideMineruLinkedRegions={() => onHideMineruLinkedRegions(filePath)}
                  onShowMineruLinkedRegions={() => onShowMineruLinkedRegions(filePath)}
                  onMineruClearCurrentCache={() => onMineruClearCurrentCache(filePath)}
                  onMineruClearAllCaches={onMineruClearAllCaches}
                  onSessionChange={(viewState) => onPdfViewStateChange(filePath, viewState)}
                  onToolbarChange={isVisible ? onPdfToolbarChange : undefined}
                  pptSettings={pptSettings}
                  pptModelOptions={pptModelOptions}
                  pptReasoningOptions={pptReasoningOptions}
                  pdfEditorSettings={pdfEditorSettings}
                  isPptGenerating={isPptGenerating}
                  onPptSettingsChange={onPptSettingsChange}
                  onGeneratePpt={() => onGeneratePpt(filePath)}
                  isMindmapGenerating={isMindmapGenerating}
                  onGenerateMindmap={onMindmapGenerate}
                  mineruSettings={mineruSettings}
                  onMineruSettingsChange={onMineruSettingsChange}
                  mineruParseResult={mineruParseResultByPdfPath[filePath]}
                  isMineruOverlayHidden={Boolean(hiddenMineruOverlayByPdfPath[filePath])}
                  linkedNoteRegions={isVisible ? linkedNoteRegions : []}
                  focusedPdfSourceRegion={isVisible ? focusedPdfSourceRegion : null}
                  focusedPdfSourceRegionNonce={focusedPdfSourceRegionNonce}
                  onLinkedNoteRegionSelect={onLinkedNoteRegionSelect}
                />
              </div>
            )
          })
        ) : (
          <PdfViewer
            filePath=""
            isActive={activeEditor === 'pdf'}
            onOpenPdf={onOpenPdf}
            onStatus={onStatus}
            onAskSelection={(selection) => onAskSelection('', selection)}
            onExplainSelection={(selection) => onExplainSelection('', selection)}
            onCreatePdfNote={() => onCreatePdfNote('')}
            onParseWithMineru={() => onParseWithMineru('')}
            onGenerateMineruNote={() => onGenerateMineruNote('')}
            onOpenFullTranslation={() => onOpenFullTranslation('')}
            onHideMineruLinkedRegions={() => onHideMineruLinkedRegions('')}
            onShowMineruLinkedRegions={() => onShowMineruLinkedRegions('')}
            onMineruClearCurrentCache={() => onMineruClearCurrentCache('')}
            onMineruClearAllCaches={onMineruClearAllCaches}
            onToolbarChange={activeEditor === 'pdf' ? onPdfToolbarChange : undefined}
            pptSettings={pptSettings}
            pptModelOptions={pptModelOptions}
            pptReasoningOptions={pptReasoningOptions}
            pdfEditorSettings={pdfEditorSettings}
            isPptGenerating={isPptGenerating}
            onPptSettingsChange={onPptSettingsChange}
            onGeneratePpt={() => onGeneratePpt('')}
            isMindmapGenerating={isMindmapGenerating}
            onGenerateMindmap={onMindmapGenerate}
            mineruSettings={mineruSettings}
            onMineruSettingsChange={onMineruSettingsChange}
            linkedNoteRegions={linkedNoteRegions}
            focusedPdfSourceRegion={focusedPdfSourceRegion}
            focusedPdfSourceRegionNonce={focusedPdfSourceRegionNonce}
            mineruParseResult={undefined}
            onLinkedNoteRegionSelect={onLinkedNoteRegionSelect}
          />
        )}
      </div>
      <div className={activeEditor === 'graph' ? 'editor-mode-cache graph active' : 'editor-mode-cache graph'}>
        <AiQuestionMapCanvas
          paperPath={currentGraphPaperPath}
          paperTitle={currentGraphPaperTitle}
          conversations={graphConversations}
          isActive={activeEditor === 'graph'}
          activeConversationId={activeGraphConversationId}
          focusedMessageId={focusedAiMessageId}
          onQuestionSelect={onAiGraphNodeSelect}
          onOpenPdf={onOpenPdf}
        />
      </div>
      <div className={activeEditor === 'mindmap' ? 'editor-mode-cache mindmap active' : 'editor-mode-cache mindmap'}>
        <MarkmapMindmapViewer
          mindmap={currentMindmap}
          paperTitle={currentMindmapPaperTitle}
          isActive={activeEditor === 'mindmap'}
          isGenerating={isMindmapGenerating}
          warnings={mindmapWarnings}
          onOpenPdf={onOpenPdf}
          onGenerate={onMindmapGenerate}
          onNodeJump={onMindmapNodeJump}
        />
      </div>
    </div>
  )
}
