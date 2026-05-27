import type {
  AppResource,
  DeckIntent,
  DeckSpec,
  EntityId,
  PptExportJob,
  PptExportResult,
  SourceRef
} from '@thesis-agent/shared'

export type Disposable = {
  dispose: () => void
}

export type CommandHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  ...args: TArgs
) => TResult | Promise<TResult>

export type CommandContribution<TArgs extends unknown[] = unknown[], TResult = unknown> = {
  id: string
  title: string
  category?: string
  when?: string
  run: CommandHandler<TArgs, TResult>
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandContribution>()

  registerCommand(command: CommandContribution): Disposable {
    if (this.commands.has(command.id)) {
      throw new Error(`Command already registered: ${command.id}`)
    }

    this.commands.set(command.id, command)

    return {
      dispose: () => {
        this.commands.delete(command.id)
      }
    }
  }

  async executeCommand<TResult = unknown>(id: string, ...args: unknown[]): Promise<TResult> {
    const command = this.commands.get(id)

    if (!command) {
      throw new Error(`Command not found: ${id}`)
    }

    return command.run(...args) as Promise<TResult>
  }

  getCommands(): CommandContribution[] {
    return [...this.commands.values()]
  }
}

export type ViewLocation = 'activitybar' | 'primary-sidebar' | 'auxiliary-sidebar' | 'bottom-panel'

export type ViewContribution = {
  id: string
  title: string
  icon?: string
  location: ViewLocation
}

export class ViewRegistry {
  private readonly views = new Map<string, ViewContribution>()

  registerView(view: ViewContribution): Disposable {
    this.views.set(view.id, view)

    return {
      dispose: () => {
        this.views.delete(view.id)
      }
    }
  }

  getViews(location?: ViewLocation): ViewContribution[] {
    const views = [...this.views.values()]
    return location ? views.filter((view) => view.location === location) : views
  }
}

export type EditorContribution = {
  id: string
  title: string
  canOpen: (resource: AppResource) => boolean
}

export class EditorRegistry {
  private readonly editors = new Map<string, EditorContribution>()

  registerEditor(editor: EditorContribution): Disposable {
    this.editors.set(editor.id, editor)

    return {
      dispose: () => {
        this.editors.delete(editor.id)
      }
    }
  }

  findEditor(resource: AppResource): EditorContribution | undefined {
    return [...this.editors.values()].find((editor) => editor.canOpen(resource))
  }
}

export type MenuLocation =
  | 'menus.pdfSelection'
  | 'menus.annotation'
  | 'menus.noteBlock'
  | 'menus.graphNode'
  | 'menus.citationHover'
  | 'toolbars.pdf'
  | 'toolbars.note'
  | 'toolbars.graph'

export type MenuContribution = {
  command: string
  location: MenuLocation
  group?: string
  order?: number
  when?: string
}

export class MenuRegistry {
  private readonly menuItems: MenuContribution[] = []

  registerMenuItem(item: MenuContribution): Disposable {
    this.menuItems.push(item)

    return {
      dispose: () => {
        const index = this.menuItems.indexOf(item)
        if (index >= 0) {
          this.menuItems.splice(index, 1)
        }
      }
    }
  }

  getMenuItems(location: MenuLocation): MenuContribution[] {
    return this.menuItems
      .filter((item) => item.location === location)
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
  }
}

export type WorkbenchContext = {
  commands: CommandRegistry
  views: ViewRegistry
  editors: EditorRegistry
  menus: MenuRegistry
  subscriptions: Disposable[]
}

export type WorkbenchExtension = {
  id: string
  activate: (context: WorkbenchContext) => void | Promise<void>
}

export function createWorkbenchContext(): WorkbenchContext {
  return {
    commands: new CommandRegistry(),
    views: new ViewRegistry(),
    editors: new EditorRegistry(),
    menus: new MenuRegistry(),
    subscriptions: []
  }
}

export async function activateExtensions(
  context: WorkbenchContext,
  extensions: WorkbenchExtension[]
): Promise<void> {
  for (const extension of extensions) {
    await extension.activate(context)
  }
}

export const pptGenerateFromPaperCommand = 'ppt.generateFromPaper' as const
export const pptGenerateFromNoteCommand = 'ppt.generateFromNote' as const
export const pptGenerateFromSelectionCommand = 'ppt.generateFromSelection' as const
export const pptExportDeckCommand = 'ppt.exportDeck' as const
export const pptRetryJobCommand = 'ppt.retryJob' as const
export const pptOpenJobHistoryCommand = 'ppt.openJobHistory' as const
export const mindmapGenerateFromPaperCommand = 'mindmap.generateFromPaper' as const
export const mindmapOpenCurrentCommand = 'mindmap.openCurrent' as const
export const codeAnalysisAnalyzeCurrentPaperCommand = 'codeAnalysis.analyzeCurrentPaper' as const

export const pptCommands = [
  pptGenerateFromPaperCommand,
  pptGenerateFromNoteCommand,
  pptGenerateFromSelectionCommand,
  pptExportDeckCommand,
  pptRetryJobCommand,
  pptOpenJobHistoryCommand
] as const

export type PptCommandId = (typeof pptCommands)[number]

export const mindmapCommands = [mindmapGenerateFromPaperCommand, mindmapOpenCurrentCommand] as const

export type MindmapCommandId = (typeof mindmapCommands)[number]

export const codeAnalysisCommands = [codeAnalysisAnalyzeCurrentPaperCommand] as const

export type CodeAnalysisCommandId = (typeof codeAnalysisCommands)[number]

export type PptGenerateFromPaperInput = {
  paperId: EntityId
  paperTitle?: string
  filePath?: string
  intent?: Partial<DeckIntent>
}

export type PptGenerateFromNoteInput = {
  noteId: EntityId
  paperId?: EntityId
  title?: string
  intent?: Partial<DeckIntent>
}

export type PptGenerateFromSelectionInput = {
  text: string
  paperId?: EntityId
  pageNo?: number
  sourceRef?: SourceRef
  intent?: Partial<DeckIntent>
}

export type PptGenerateDeckResult = {
  job?: PptExportJob
  deck?: DeckSpec
  exportResult?: PptExportDeckResult
  warnings?: string[]
  message?: string
}

export type PptExportDeckInput = {
  deck: DeckSpec
  suggestedFileName?: string
}

export type PptExportDeckResult = PptExportResult & {
  canceled?: boolean
  filePath?: string
}

export type PptRetryJobInput = {
  jobId: EntityId
}

export type MindmapGenerateFromPaperInput = {
  paperId?: EntityId
  paperTitle?: string
  filePath?: string
}

export type MindmapGenerateFromPaperResult = {
  markdown?: string
  warnings?: string[]
  message?: string
  requiresParsing?: boolean
}

export type CodeAnalysisAnalyzeCurrentPaperInput = {
  paperId?: EntityId
  paperTitle?: string
  filePath?: string
}

export type CodeAnalysisAnalyzeCurrentPaperResult = {
  requiresParsing?: boolean
  warnings?: string[]
  message?: string
}

export type MindmapWorkbenchHandlers = {
  generateFromPaper: (
    input: MindmapGenerateFromPaperInput
  ) => MindmapGenerateFromPaperResult | Promise<MindmapGenerateFromPaperResult>
  openCurrent: (input?: MindmapGenerateFromPaperInput) => void | Promise<void>
}

export type CodeAnalysisWorkbenchHandlers = {
  analyzeCurrentPaper: (
    input: CodeAnalysisAnalyzeCurrentPaperInput
  ) => CodeAnalysisAnalyzeCurrentPaperResult | Promise<CodeAnalysisAnalyzeCurrentPaperResult>
}

export type PptWorkbenchHandlers = {
  generateFromPaper: (input: PptGenerateFromPaperInput) => PptGenerateDeckResult | Promise<PptGenerateDeckResult>
  generateFromNote: (input: PptGenerateFromNoteInput) => PptGenerateDeckResult | Promise<PptGenerateDeckResult>
  generateFromSelection: (input: PptGenerateFromSelectionInput) => PptGenerateDeckResult | Promise<PptGenerateDeckResult>
  exportDeck: (input: PptExportDeckInput) => PptExportDeckResult | Promise<PptExportDeckResult>
  retryJob: (input: PptRetryJobInput) => PptExportJob | Promise<PptExportJob>
  openJobHistory: () => void | Promise<void>
}

export function createPptWorkbenchExtension(handlers: Partial<PptWorkbenchHandlers> = {}): WorkbenchExtension {
  return {
    id: '@thesis-agent/plugin-ppt',
    activate: (context) => {
      context.subscriptions.push(
        context.commands.registerCommand({
          id: pptGenerateFromPaperCommand,
          title: '从论文生成 PPT',
          category: 'PPT',
          when: 'paperOpen',
          run: (input: unknown) =>
            runPptHandler(pptGenerateFromPaperCommand, handlers.generateFromPaper, input as PptGenerateFromPaperInput)
        }),
        context.commands.registerCommand({
          id: pptGenerateFromNoteCommand,
          title: '从笔记生成 PPT',
          category: 'PPT',
          when: 'noteFocused',
          run: (input: unknown) =>
            runPptHandler(pptGenerateFromNoteCommand, handlers.generateFromNote, input as PptGenerateFromNoteInput)
        }),
        context.commands.registerCommand({
          id: pptGenerateFromSelectionCommand,
          title: '从选区生成 PPT',
          category: 'PPT',
          when: 'pdfSelection',
          run: (input: unknown) =>
            runPptHandler(
              pptGenerateFromSelectionCommand,
              handlers.generateFromSelection,
              input as PptGenerateFromSelectionInput
            )
        }),
        context.commands.registerCommand({
          id: pptExportDeckCommand,
          title: '导出 PPT',
          category: 'PPT',
          run: (input: unknown) => runPptHandler(pptExportDeckCommand, handlers.exportDeck, input as PptExportDeckInput)
        }),
        context.commands.registerCommand({
          id: pptRetryJobCommand,
          title: '重试 PPT 任务',
          category: 'PPT',
          run: (input: unknown) => runPptHandler(pptRetryJobCommand, handlers.retryJob, input as PptRetryJobInput)
        }),
        context.commands.registerCommand({
          id: pptOpenJobHistoryCommand,
          title: '打开 PPT 导出历史',
          category: 'PPT',
          run: () => runPptHandler(pptOpenJobHistoryCommand, handlers.openJobHistory, undefined)
        }),
        context.menus.registerMenuItem({
          command: pptGenerateFromPaperCommand,
          location: 'toolbars.pdf',
          group: 'ppt',
          order: 80,
          when: 'paperOpen'
        }),
        context.menus.registerMenuItem({
          command: pptGenerateFromSelectionCommand,
          location: 'menus.pdfSelection',
          group: 'ppt',
          order: 80,
          when: 'pdfSelection'
        }),
        context.menus.registerMenuItem({
          command: pptGenerateFromNoteCommand,
          location: 'toolbars.note',
          group: 'ppt',
          order: 80,
          when: 'noteFocused'
        })
      )
    }
  }
}

export const pptExtension = createPptWorkbenchExtension()

export function createMindmapWorkbenchExtension(handlers: Partial<MindmapWorkbenchHandlers> = {}): WorkbenchExtension {
  return {
    id: '@thesis-agent/plugin-mindmap',
    activate: (context) => {
      context.subscriptions.push(
        context.commands.registerCommand({
          id: mindmapGenerateFromPaperCommand,
          title: '生成论文脑图',
          category: 'Mindmap',
          when: 'paperOpen',
          run: (input: unknown) =>
            runMindmapHandler(
              mindmapGenerateFromPaperCommand,
              handlers.generateFromPaper,
              normalizeMindmapGenerateInput(input)
            )
        }),
        context.commands.registerCommand({
          id: mindmapOpenCurrentCommand,
          title: '打开当前脑图',
          category: 'Mindmap',
          when: 'paperOpen',
          run: (input: unknown) =>
            runMindmapHandler(mindmapOpenCurrentCommand, handlers.openCurrent, normalizeMindmapGenerateInput(input))
        }),
        context.menus.registerMenuItem({
          command: mindmapGenerateFromPaperCommand,
          location: 'toolbars.pdf',
          group: 'mindmap',
          order: 70,
          when: 'paperOpen'
        })
      )
    }
  }
}

export const mindmapExtension = createMindmapWorkbenchExtension()

export function createCodeAnalysisWorkbenchExtension(
  handlers: Partial<CodeAnalysisWorkbenchHandlers> = {}
): WorkbenchExtension {
  return {
    id: '@thesis-agent/plugin-code-analysis',
    activate: (context) => {
      context.subscriptions.push(
        context.commands.registerCommand({
          id: codeAnalysisAnalyzeCurrentPaperCommand,
          title: '代码解析',
          category: 'Code Analysis',
          when: 'paperOpen',
          run: (input: unknown) =>
            runCodeAnalysisHandler(
              codeAnalysisAnalyzeCurrentPaperCommand,
              handlers.analyzeCurrentPaper,
              normalizeCodeAnalysisAnalyzeCurrentPaperInput(input)
            )
        })
      )
    }
  }
}

export const codeAnalysisExtension = createCodeAnalysisWorkbenchExtension()

function runPptHandler<TInput, TResult>(
  commandId: PptCommandId,
  handler: ((input: TInput) => TResult | Promise<TResult>) | undefined,
  input: TInput
): TResult | Promise<TResult> {
  if (!handler) {
    throw new Error(`PPT 命令尚未接入处理器：${commandId}`)
  }

  return handler(input)
}

function runMindmapHandler<TInput, TResult>(
  commandId: MindmapCommandId,
  handler: ((input: TInput) => TResult | Promise<TResult>) | undefined,
  input: TInput
): TResult | Promise<TResult> {
  if (!handler) {
    throw new Error(`脑图命令尚未接入处理器：${commandId}`)
  }

  return handler(input)
}

function runCodeAnalysisHandler<TInput, TResult>(
  commandId: CodeAnalysisCommandId,
  handler: ((input: TInput) => TResult | Promise<TResult>) | undefined,
  input: TInput
): TResult | Promise<TResult> {
  if (!handler) {
    throw new Error(`代码解析命令尚未接入处理器：${commandId}`)
  }

  return handler(input)
}

function normalizeMindmapGenerateInput(input: unknown): MindmapGenerateFromPaperInput {
  if (!input || typeof input !== 'object') {
    return {}
  }

  const data = input as Partial<MindmapGenerateFromPaperInput>

  return {
    paperId: typeof data.paperId === 'string' ? data.paperId : undefined,
    paperTitle: typeof data.paperTitle === 'string' ? data.paperTitle : undefined,
    filePath: typeof data.filePath === 'string' ? data.filePath : undefined
  }
}

function normalizeCodeAnalysisAnalyzeCurrentPaperInput(input: unknown): CodeAnalysisAnalyzeCurrentPaperInput {
  if (!input || typeof input !== 'object') {
    return {}
  }

  const data = input as Partial<CodeAnalysisAnalyzeCurrentPaperInput>

  return {
    paperId: typeof data.paperId === 'string' ? data.paperId : undefined,
    paperTitle: typeof data.paperTitle === 'string' ? data.paperTitle : undefined,
    filePath: typeof data.filePath === 'string' ? data.filePath : undefined
  }
}
