import type { AppResource } from '@thesis-agent/shared'

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
