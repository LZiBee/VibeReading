import type { DragEvent } from 'react'
import type {
  ClosableDockPanelId,
  DockDropPosition,
  DockLayoutNode,
  DockPanelId,
  DockSplitNode,
  WorkbenchLayoutDirection
} from './types'

export const dockPanelItems: Array<{
  id: DockPanelId
  title: string
  icon: string
}> = [
  { id: 'library', title: 'Library', icon: 'codicon-library' },
  { id: 'editor', title: 'PDF', icon: 'codicon-file-pdf' },
  { id: 'note', title: 'Note', icon: 'codicon-notebook' },
  { id: 'ai', title: 'AI', icon: 'codicon-sparkle' }
]

const allDockPanelIds: DockPanelId[] = ['library', 'editor', 'note', 'ai']

export const closableDockPanelIds: ClosableDockPanelId[] = ['editor', 'note', 'ai']
export const dockPanelDragMimeType = 'application/x-thesis-agent-dock-panel'

export const initialDockLayout: DockSplitNode = {
  id: 'root',
  direction: 'horizontal',
  children: ['library', 'editor', 'note', 'ai']
}

function getDockPanelDefaultSize(panelId: DockPanelId, layoutDirection: WorkbenchLayoutDirection): number {
  if (layoutDirection === 'vertical') {
    if (panelId === 'editor') {
      return 42
    }

    if (panelId === 'library') {
      return 18
    }

    return panelId === 'note' ? 20 : 20
  }

  if (panelId === 'editor') {
    return 42
  }

  if (panelId === 'library') {
    return 18
  }

  return panelId === 'note' ? 20 : 20
}

function getDockPanelMinSize(panelId: DockPanelId): number {
  if (panelId === 'editor') {
    return 24
  }

  return panelId === 'library' ? 14 : 18
}

function getDockNodeDefaultSize(node: DockLayoutNode, layoutDirection: WorkbenchLayoutDirection): number {
  if (isDockPanelId(node)) {
    return getDockPanelDefaultSize(node, layoutDirection)
  }

  return flattenDockLayout(node).reduce((size, panelId) => size + getDockPanelDefaultSize(panelId, layoutDirection), 0)
}

export function getDockNodeDefaultSizes(
  children: DockLayoutNode[],
  layoutDirection: WorkbenchLayoutDirection
): number[] {
  const weights = children.map((child) => Math.max(1, getDockNodeDefaultSize(child, layoutDirection)))
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)

  if (totalWeight <= 0 || children.length === 0) {
    return []
  }

  let allocatedSize = 0
  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return Number((100 - allocatedSize).toFixed(4))
    }

    const size = Number(((weight / totalWeight) * 100).toFixed(4))
    allocatedSize += size
    return size
  })
}

export function getDockNodeMinSize(node: DockLayoutNode): number {
  if (isDockPanelId(node)) {
    return getDockPanelMinSize(node)
  }

  return Math.min(72, flattenDockLayout(node).reduce((size, panelId) => size + getDockPanelMinSize(panelId), 0))
}

export function getDockNodeKey(node: DockLayoutNode): string {
  return isDockPanelId(node) ? node : node.id
}

export function getDockPanelGroupId(node: DockSplitNode): string {
  return `dock-group-${node.id}`
}

export function getDockResizableNodeId(node: DockLayoutNode): string {
  return isDockPanelId(node) ? `dock-panel-${node}` : `dock-split-${node.id}`
}

export function getDockPanelResizeHandleId(groupId: string, index: number): string {
  return `${groupId}-resize-${index}`
}

function createDockSplit(direction: WorkbenchLayoutDirection, children: DockLayoutNode[]): DockSplitNode {
  return {
    id: createDockNodeId(),
    direction,
    children
  }
}

function createDockNodeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `dock_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function removePanelFromDockLayout(node: DockLayoutNode, panelId: DockPanelId): DockLayoutNode | null {
  if (isDockPanelId(node)) {
    return node === panelId ? null : node
  }

  const children = node.children
    .map((child) => removePanelFromDockLayout(child, panelId))
    .filter((child): child is DockLayoutNode => child !== null)

  if (children.length === 0) {
    return null
  }

  if (children.length === 1) {
    return children[0]
  }

  return {
    ...node,
    children
  }
}

export function removePanelsFromDockLayout(node: DockLayoutNode, panelIds: Set<DockPanelId>): DockLayoutNode | null {
  if (panelIds.size === 0) {
    return node
  }

  if (isDockPanelId(node)) {
    return panelIds.has(node) ? null : node
  }

  const children = node.children
    .map((child) => removePanelsFromDockLayout(child, panelIds))
    .filter((child): child is DockLayoutNode => child !== null)

  if (children.length === 0) {
    return null
  }

  if (children.length === 1) {
    return children[0]
  }

  return {
    ...node,
    children
  }
}

export function completeDockLayout(node: DockLayoutNode): DockLayoutNode {
  const panelIds = flattenDockLayout(node)
  const uniquePanelIds = new Set(panelIds)
  const isCompleteLayout =
    panelIds.length === allDockPanelIds.length &&
    uniquePanelIds.size === allDockPanelIds.length &&
    allDockPanelIds.every((panelId) => uniquePanelIds.has(panelId))

  return isCompleteLayout ? node : initialDockLayout
}

export function insertPanelIntoDockLayout(
  node: DockLayoutNode,
  sourceId: DockPanelId,
  targetId: DockPanelId,
  position: DockDropPosition
): DockLayoutNode {
  const nextDirection = getDockDirectionFromDropPosition(position)
  const sourceFirst = position === 'left' || position === 'top'

  if (isDockPanelId(node)) {
    return node === targetId
      ? createDockSplit(nextDirection, sourceFirst ? [sourceId, node] : [node, sourceId])
      : node
  }

  const directTargetIndex = node.children.findIndex((child) => child === targetId)

  if (directTargetIndex >= 0) {
    if (node.direction === nextDirection) {
      const children = [...node.children]
      children.splice(sourceFirst ? directTargetIndex : directTargetIndex + 1, 0, sourceId)
      return {
        ...node,
        children
      }
    }

    return {
      ...node,
      children: node.children.map((child, index) =>
        index === directTargetIndex
          ? createDockSplit(nextDirection, sourceFirst ? [sourceId, child] : [child, sourceId])
          : child
      )
    }
  }

  return {
    ...node,
    children: node.children.map((child) =>
      containsDockPanel(child, targetId) ? insertPanelIntoDockLayout(child, sourceId, targetId, position) : child
    )
  }
}

function containsDockPanel(node: DockLayoutNode, panelId: DockPanelId): boolean {
  if (isDockPanelId(node)) {
    return node === panelId
  }

  return node.children.some((child) => containsDockPanel(child, panelId))
}

function flattenDockLayout(node: DockLayoutNode): DockPanelId[] {
  if (isDockPanelId(node)) {
    return [node]
  }

  return node.children.flatMap((child) => flattenDockLayout(child))
}

function getDockDirectionFromDropPosition(position: DockDropPosition): WorkbenchLayoutDirection {
  return position === 'left' || position === 'right' ? 'horizontal' : 'vertical'
}

export function getDockDropPosition(event: DragEvent<HTMLElement>): DockDropPosition {
  const rect = event.currentTarget.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const offsetY = event.clientY - rect.top
  const horizontalRatio = rect.width <= 0 ? 0.5 : offsetX / rect.width
  const verticalRatio = rect.height <= 0 ? 0.5 : offsetY / rect.height
  const distances = [
    { position: 'left', value: horizontalRatio },
    { position: 'right', value: 1 - horizontalRatio },
    { position: 'top', value: verticalRatio },
    { position: 'bottom', value: 1 - verticalRatio }
  ] as const

  return distances.reduce((closest, current) => (current.value < closest.value ? current : closest)).position
}

export function shouldClearDropPreview(event: DragEvent<HTMLElement>): boolean {
  return !event.currentTarget.contains(event.relatedTarget as Node | null)
}

export function isDockPanelId(value: unknown): value is DockPanelId {
  return typeof value === 'string' && allDockPanelIds.includes(value as DockPanelId)
}

export function isClosableDockPanelId(value: unknown): value is ClosableDockPanelId {
  return typeof value === 'string' && closableDockPanelIds.includes(value as ClosableDockPanelId)
}

export function filterClosableDockPanelIds(values: unknown[]): ClosableDockPanelId[] {
  return values.filter(isClosableDockPanelId).filter((panelId, index, panelIds) => panelIds.indexOf(panelId) === index)
}

export function getDockPanelTitle(panelId: DockPanelId): string {
  return dockPanelItems.find((item) => item.id === panelId)?.title ?? panelId
}
