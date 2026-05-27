import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDir = mkdtempSync(join(tmpdir(), 'thesis-agent-ppt-pipeline-'))
const bundlePath = join(tempDir, 'ppt-pipeline-smoke.mjs')
const esbuildBin = join(process.cwd(), 'node_modules', 'esbuild', 'bin', 'esbuild')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    const reason = result.error ? `: ${result.error.message}` : ''
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}${reason}`)
  }
}

try {
  run(process.execPath, [
    esbuildBin,
    'tests/ppt-pipeline-smoke.ts',
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${bundlePath}`
  ])

  run(process.execPath, [bundlePath])
} finally {
  rmSync(tempDir, {
    force: true,
    recursive: true
  })
}
