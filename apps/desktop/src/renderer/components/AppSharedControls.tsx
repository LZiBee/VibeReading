import type { ReactElement, ReactNode } from 'react'

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }): ReactElement {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {action ? <div className="section-header-actions">{action}</div> : null}
    </div>
  )
}

export function PrimarySidebarCollapseButton({ onCollapse }: { onCollapse: () => void }): ReactElement {
  return (
    <button
      className="section-header-icon-button"
      type="button"
      title="收起侧边栏"
      aria-label="收起侧边栏"
      onClick={onCollapse}
    >
      <span className="codicon codicon-chevron-left" aria-hidden="true" />
    </button>
  )
}

export function FavoriteButton({
  active,
  label,
  title,
  disabled,
  onClick
}: {
  active: boolean
  label: string
  title?: string
  disabled?: boolean
  onClick: () => void
}): ReactElement {
  const buttonTitle = title ?? (active ? `取消收藏 ${label}` : `收藏 ${label}`)

  return (
    <button
      className={active ? 'icon-button favorite-button active' : 'icon-button favorite-button'}
      type="button"
      title={buttonTitle}
      aria-label={buttonTitle}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={active ? 'codicon codicon-star-full' : 'codicon codicon-star-empty'} aria-hidden="true" />
    </button>
  )
}

export function EntryRowActionButton({
  icon,
  title,
  ariaLabel,
  variant = 'default',
  onClick
}: {
  icon: string
  title: string
  ariaLabel: string
  variant?: 'default' | 'danger'
  onClick: () => void
}): ReactElement {
  return (
    <button
      className={variant === 'danger' ? 'entry-row-action danger' : 'entry-row-action'}
      type="button"
      title={title}
      aria-label={ariaLabel}
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onMouseDown={(event) => {
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
    >
      <span className={`codicon ${icon}`} aria-hidden="true" />
    </button>
  )
}
