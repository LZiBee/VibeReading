import { createReadStream, cpSync, existsSync, rmSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, relative, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin, ViteDevServer } from 'vite'

const require = createRequire(import.meta.url)
const internalPackageDeps = [
  '@thesis-agent/ai',
  '@thesis-agent/citations',
  '@thesis-agent/db',
  '@thesis-agent/dictionary',
  '@thesis-agent/graph',
  '@thesis-agent/notes',
  '@thesis-agent/pdf',
  '@thesis-agent/ppt',
  '@thesis-agent/rag',
  '@thesis-agent/shared',
  '@thesis-agent/ui',
  '@thesis-agent/workbench'
] as const
const pdfjsDistPath = dirname(require.resolve('pdfjs-dist/package.json'))
const pdfjsAssetDirs = ['cmaps', 'standard_fonts', 'wasm'] as const
const pdfjsAssetMimeTypes: Record<string, string> = {
  '.bcmap': 'application/octet-stream',
  '.js': 'text/javascript; charset=utf-8',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
}

function copyPdfjsAssets(): void {
  const outputRoot = resolve('out/renderer/pdfjs')
  rmSync(outputRoot, { force: true, recursive: true })

  for (const dir of pdfjsAssetDirs) {
    cpSync(resolve(pdfjsDistPath, dir), resolve(outputRoot, dir), {
      force: true,
      recursive: true
    })
  }
}

function isPdfjsAssetPath(filePath: string): boolean {
  const relativePath = relative(pdfjsDistPath, filePath)
  if (relativePath.startsWith('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    return false
  }

  const [rootDir] = relativePath.split(/[\\/]/)
  return pdfjsAssetDirs.includes(rootDir as (typeof pdfjsAssetDirs)[number])
}

function pdfjsAssetsPlugin(): Plugin {
  return {
    name: 'pdfjs-assets',
    configureServer(server: ViteDevServer): void {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const rawUrl = req.url ?? ''
        const requestUrl = new URL(rawUrl, 'http://localhost')

        if (!requestUrl.pathname.startsWith('/pdfjs/')) {
          next()
          return
        }

        const assetPath = decodeURIComponent(requestUrl.pathname.slice('/pdfjs/'.length))
        const filePath = resolve(pdfjsDistPath, assetPath)

        if (!isPdfjsAssetPath(filePath) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        res.setHeader('Content-Type', pdfjsAssetMimeTypes[extname(filePath)] ?? 'application/octet-stream')
        createReadStream(filePath).pipe(res)
      })
    },
    closeBundle(): void {
      copyPdfjsAssets()
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [...internalPackageDeps] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [...internalPackageDeps] })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer')
      }
    },
    plugins: [react(), pdfjsAssetsPlugin()]
  }
})
