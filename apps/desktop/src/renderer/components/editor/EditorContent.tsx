import type { ReactElement } from 'react'
import type { PersistedMineruSettingsState, PersistedPdfViewState } from '../../../preload/thesis-agent'
import type { MineruParseResult } from '@thesis-agent/shared'
import type { EditorTab, PdfLinkedNoteRegion, PdfViewStates } from '../../app/types'
import { PdfViewer, pdfRendererCacheKey } from '../PdfViewer'
import type { PdfViewerToolbarBridge } from '../PdfViewer'

export function EditorContent({
  activeEditor,
  openPdfPaths,
  selectedPdfPath,
  pdfViewStates,
  focusedPdfSourceRegion,
  focusedPdfSourceRegionNonce,
  onOpenPdf,
  onStatus,
  onAskSelection,
  onCreatePdfNote,
  onParseWithMineru,
  onGenerateMineruNote,
  onHideMineruLinkedRegions,
  onShowMineruLinkedRegions,
  onMineruClearCurrentCache,
  onMineruClearAllCaches,
  onPdfViewStateChange,
  onPdfToolbarChange,
  mineruSettings,
  onMineruSettingsChange,
  mineruParseResultByPdfPath,
  hiddenMineruOverlayByPdfPath,
  linkedNoteRegions,
  onLinkedNoteRegionSelect
}: {
  activeEditor: EditorTab
  openPdfPaths: string[]
  selectedPdfPath: string
  pdfViewStates: PdfViewStates
  focusedPdfSourceRegion?: PdfLinkedNoteRegion | null
  focusedPdfSourceRegionNonce: number
  onOpenPdf: () => void
  onStatus: (status: string) => void
  onAskSelection: () => void
  onCreatePdfNote: (filePath: string) => void
  onParseWithMineru: (filePath: string) => void
  onGenerateMineruNote: (filePath: string) => void
  onHideMineruLinkedRegions: (filePath: string) => void
  onShowMineruLinkedRegions: (filePath: string) => void
  onMineruClearCurrentCache: (filePath: string) => void
  onMineruClearAllCaches: () => void
  onPdfViewStateChange: (filePath: string, viewState: PersistedPdfViewState) => void
  onPdfToolbarChange: (toolbar: PdfViewerToolbarBridge | null) => void
  mineruSettings: PersistedMineruSettingsState
  onMineruSettingsChange: (patch: Partial<PersistedMineruSettingsState>) => void
  mineruParseResultByPdfPath: Record<string, MineruParseResult>
  hiddenMineruOverlayByPdfPath: Record<string, boolean>
  linkedNoteRegions: PdfLinkedNoteRegion[]
  onLinkedNoteRegionSelect: (region: PdfLinkedNoteRegion) => void
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
                  onAskSelection={onAskSelection}
                  onCreatePdfNote={() => onCreatePdfNote(filePath)}
                  onParseWithMineru={() => onParseWithMineru(filePath)}
                  onGenerateMineruNote={() => onGenerateMineruNote(filePath)}
                  onHideMineruLinkedRegions={() => onHideMineruLinkedRegions(filePath)}
                  onShowMineruLinkedRegions={() => onShowMineruLinkedRegions(filePath)}
                  onMineruClearCurrentCache={() => onMineruClearCurrentCache(filePath)}
                  onMineruClearAllCaches={onMineruClearAllCaches}
                  onSessionChange={(viewState) => onPdfViewStateChange(filePath, viewState)}
                  onToolbarChange={isVisible ? onPdfToolbarChange : undefined}
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
            onAskSelection={onAskSelection}
            onCreatePdfNote={() => onCreatePdfNote('')}
            onParseWithMineru={() => onParseWithMineru('')}
            onGenerateMineruNote={() => onGenerateMineruNote('')}
            onHideMineruLinkedRegions={() => onHideMineruLinkedRegions('')}
            onShowMineruLinkedRegions={() => onShowMineruLinkedRegions('')}
            onMineruClearCurrentCache={() => onMineruClearCurrentCache('')}
            onMineruClearAllCaches={onMineruClearAllCaches}
            onToolbarChange={activeEditor === 'pdf' ? onPdfToolbarChange : undefined}
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
    </div>
  )
}
