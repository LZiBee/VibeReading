import '@vscode/codicons/dist/codicon.css'
import 'katex/dist/katex.min.css'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/nord.css'
import '@xyflow/react/dist/style.css'
import './polyfills/uint8array-to-hex'
import './polyfills/map-get-or-insert'
import './polyfills/math-sum-precise'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
