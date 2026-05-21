import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { profileDisplayName } from '../../app/constants'
import {
  formatReadingDuration,
  formatUpdatedAt,
  getFileName,
  getProfileActivityCells,
  getProfileNoteSummaries,
  getProfileReadingItems
} from '../../app/sidebarUtils'
import type { FavoriteItemsByKey, NotesByPaperPath, PdfViewStates } from '../../app/types'

export function ProfileHomePage({
  libraryPdfPaths,
  selectedPdfPath,
  pdfViewStates,
  notesByPaperPath,
  favoriteItemsByKey
}: {
  libraryPdfPaths: string[]
  selectedPdfPath: string
  pdfViewStates: PdfViewStates
  notesByPaperPath: NotesByPaperPath
  favoriteItemsByKey: FavoriteItemsByKey
}): ReactElement {
  const noteSummaries = useMemo(() => getProfileNoteSummaries(notesByPaperPath), [notesByPaperPath])
  const readingItems = useMemo(
    () => getProfileReadingItems(libraryPdfPaths, selectedPdfPath, pdfViewStates),
    [libraryPdfPaths, pdfViewStates, selectedPdfPath]
  )
  const activityCells = useMemo(() => getProfileActivityCells(notesByPaperPath, pdfViewStates), [notesByPaperPath, pdfViewStates])
  const totalParagraphs = noteSummaries.reduce((sum, note) => sum + note.blockCount, 0)
  const totalReadingSeconds = Object.values(pdfViewStates).reduce((sum, viewState) => sum + (viewState.readingSeconds ?? 0), 0)
  const activityColumns = Math.ceil(activityCells.length / 7)

  return (
    <div className="editor-surface profile-surface">
      <div className="profile-page">
        <aside className="profile-sidebar">
          <div className="profile-avatar-large" aria-hidden="true">
            <span />
          </div>
          <h1>{profileDisplayName}</h1>
          <p>论文阅读、笔记整理与 AI 知识图谱工作台。</p>
          <div className="profile-follow-row">
            <span>
              <span className="codicon codicon-account" aria-hidden="true" />1 follower
            </span>
            <span>1 following</span>
          </div>
          <dl className="profile-stat-list">
            <div>
              <dt>论文</dt>
              <dd>{libraryPdfPaths.length}</dd>
            </div>
            <div>
              <dt>笔记</dt>
              <dd>{noteSummaries.length}</dd>
            </div>
            <div>
              <dt>收藏</dt>
              <dd>{Object.keys(favoriteItemsByKey).length}</dd>
            </div>
            <div>
              <dt>阅读</dt>
              <dd>{formatReadingDuration(totalReadingSeconds)}</dd>
            </div>
          </dl>
          <div className="profile-info-list">
            <span>
              <span className="codicon codicon-notebook" aria-hidden="true" />
              {totalParagraphs} 段笔记
            </span>
            <span>
              <span className="codicon codicon-graph" aria-hidden="true" />
              本地优先的研究资料库
            </span>
          </div>
        </aside>

        <div className="profile-main">
          <section className="profile-section">
            <div className="profile-section-header">
              <h2>笔记</h2>
              <span>{noteSummaries.length} 篇</span>
            </div>
            <div className="profile-note-grid">
              {noteSummaries.length > 0 ? (
                noteSummaries.slice(0, 6).map((note) => (
                  <article key={`${note.paperPath}:${note.id}`} className="profile-note-card">
                    <div>
                      <h3>{note.title}</h3>
                      <span>{getFileName(note.paperPath)}</span>
                    </div>
                    <p>
                      {note.blockCount} 段 · {note.characterCount} 字 · {formatUpdatedAt(note.updatedAt)}
                    </p>
                  </article>
                ))
              ) : (
                <div className="profile-empty-row">
                  <span className="codicon codicon-notebook" aria-hidden="true" />
                  <span>还没有笔记</span>
                </div>
              )}
            </div>
          </section>

          <section className="profile-section">
            <div className="profile-section-header">
              <h2>活跃表</h2>
              <span>{activityCells.reduce((sum, cell) => sum + cell.count, 0)} 次记录</span>
            </div>
            <div className="profile-activity-panel">
              <div className="profile-activity-grid" style={{ gridTemplateColumns: `repeat(${activityColumns}, 10px)` }}>
                {activityCells.map((cell) => (
                  <span
                    key={cell.date}
                    className={`profile-activity-cell level-${cell.level}`}
                    title={`${cell.date} · ${cell.count} 项活动`}
                    aria-label={`${cell.date}，${cell.count} 项活动`}
                  />
                ))}
              </div>
              <div className="profile-activity-legend" aria-hidden="true">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <i key={level} className={`profile-activity-cell level-${level}`} />
                ))}
                <span>More</span>
              </div>
            </div>
          </section>

          <section className="profile-section">
            <div className="profile-section-header">
              <h2>阅读名单</h2>
              <span>{readingItems.length} 篇</span>
            </div>
            <div className="profile-reading-list">
              {readingItems.length > 0 ? (
                readingItems.map((item) => (
                  <article key={item.filePath} className={item.filePath === selectedPdfPath ? 'profile-reading-item active' : 'profile-reading-item'}>
                    <div className="profile-reading-main">
                      <strong>{item.title}</strong>
                      <span>
                        {item.readingTime} · {item.progressLabel}
                      </span>
                    </div>
                    <div className="profile-reading-progress" aria-label={`阅读进度 ${item.progressPercent}%`}>
                      <span style={{ width: `${item.progressPercent}%` }} />
                    </div>
                  </article>
                ))
              ) : (
                <div className="profile-empty-row">
                  <span className="codicon codicon-file-pdf" aria-hidden="true" />
                  <span>阅读名单为空</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
