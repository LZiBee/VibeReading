/// <reference types="vite/client" />

import type { ThesisAgentApi } from '../preload/thesis-agent'

declare global {
  interface Window {
    thesisAgent: ThesisAgentApi
  }
}
