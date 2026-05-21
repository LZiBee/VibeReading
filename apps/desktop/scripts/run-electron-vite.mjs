import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const packageJsonPath = require.resolve('electron-vite/package.json')
const cliPath = join(dirname(packageJsonPath), 'bin', 'electron-vite.js')
const env = { ...process.env }

delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  shell: false
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
