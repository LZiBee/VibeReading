export const themeTokens = {
  appBg: '--app-bg',
  sidebarBg: '--sidebar-bg',
  editorBg: '--editor-bg',
  panelBg: '--panel-bg',
  borderMuted: '--border-muted',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  accent: '--accent',
  selectionBg: '--selection-bg',
  annotationYellow: '--annotation-yellow',
  annotationGreen: '--annotation-green'
} as const

export type ThemeTokenName = keyof typeof themeTokens
