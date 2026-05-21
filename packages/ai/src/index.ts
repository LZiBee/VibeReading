import type { SourceRef } from '@thesis-agent/shared'
import type { WorkbenchExtension } from '@thesis-agent/workbench'

export type ProviderProtocol =
  | 'openai-compatible'
  | 'anthropic-compatible'
  | 'gemini'
  | 'ollama'
  | 'custom'

export type ModelProvider = {
  id: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  apiKeySecretRef?: string
  models: string[]
  defaultChatModel: string
  defaultEmbeddingModel?: string
  supportsStream: boolean
  supportsVision: boolean
  supportsEmbeddings: boolean
  customHeaders?: Record<string, string>
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatMessage = {
  role: ChatRole
  content: string
  sourceRefs?: SourceRef[]
}

export type ChatInput = {
  model: string
  messages: ChatMessage[]
  stream?: boolean
}

export type ChatChunk = {
  id?: string
  delta: string
  done?: boolean
}

export type ModelInfo = {
  id: string
  name?: string
}

export type TestResult = {
  ok: boolean
  message: string
}

export interface ChatProvider {
  id: string
  listModels(): Promise<ModelInfo[]>
  chat(input: ChatInput): AsyncIterable<ChatChunk>
  testConnection(): Promise<TestResult>
}

export const aiCommands = [
  'ai.configureProvider',
  'ai.testConnection',
  'ai.askSelection',
  'ai.expandQuestion',
  'ai.insertAnswerToNote'
] as const

export const aiExtension: WorkbenchExtension = {
  id: '@thesis-agent/plugin-ai',
  activate: (context) => {
    context.views.registerView({
      id: 'ai',
      title: 'AI',
      icon: 'sparkle',
      location: 'auxiliary-sidebar'
    })
  }
}
