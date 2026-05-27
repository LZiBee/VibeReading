import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import {
  normalizeGitHubRepositoryUrl,
  type CodeRepositoryImportantFile,
  type CodeRepositoryImportantFileKind,
  type CodeRepositoryPreparationInput,
  type CodeRepositoryPreparationResult
} from '@thesis-agent/shared'

const execFileAsync = promisify(execFile)
const codeRepositoryScanMaxFiles = 5000
const codeRepositoryImportantFileMaxCount = 80
const codeRepositoryCloneTimeoutMs = 180_000
const codeRepositoryGitTimeoutMs = 20_000
const ignoredRepositoryDirectoryNames = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'venv'
])
const configFileNames = new Set([
  '.dockerignore',
  '.env.example',
  'cmakelists.txt',
  'conda.yml',
  'conda.yaml',
  'docker-compose.yml',
  'dockerfile',
  'environment.yml',
  'environment.yaml',
  'makefile',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'pyproject.toml',
  'requirements-dev.txt',
  'requirements.txt',
  'setup.cfg',
  'setup.py',
  'yarn.lock'
])
const entryFileNames = new Set([
  'app.py',
  'cli.py',
  'demo.py',
  'eval.py',
  'evaluate.py',
  'infer.py',
  'inference.py',
  'main.py',
  'run.py',
  'server.py',
  'test.py',
  'train.py'
])
const sourceDirectoryNames = new Set([
  'config',
  'configs',
  'data',
  'dataset',
  'datasets',
  'example',
  'examples',
  'lib',
  'model',
  'models',
  'module',
  'modules',
  'src'
])
const sourceExtensions = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cu',
  '.cuh',
  '.cxx',
  '.go',
  '.h',
  '.hpp',
  '.java',
  '.jl',
  '.js',
  '.jsx',
  '.kt',
  '.m',
  '.py',
  '.r',
  '.rs',
  '.scala',
  '.swift',
  '.ts',
  '.tsx'
])
const fileLanguageByExtension = new Map<string, string>([
  ['.bat', 'Batch'],
  ['.c', 'C'],
  ['.cc', 'C++'],
  ['.cpp', 'C++'],
  ['.cs', 'C#'],
  ['.css', 'CSS'],
  ['.cu', 'CUDA'],
  ['.cuh', 'CUDA'],
  ['.cxx', 'C++'],
  ['.go', 'Go'],
  ['.h', 'C/C++ Header'],
  ['.hpp', 'C/C++ Header'],
  ['.html', 'HTML'],
  ['.ipynb', 'Jupyter Notebook'],
  ['.java', 'Java'],
  ['.jl', 'Julia'],
  ['.js', 'JavaScript'],
  ['.jsx', 'JavaScript'],
  ['.json', 'JSON'],
  ['.kt', 'Kotlin'],
  ['.lua', 'Lua'],
  ['.m', 'MATLAB'],
  ['.md', 'Markdown'],
  ['.php', 'PHP'],
  ['.ps1', 'PowerShell'],
  ['.py', 'Python'],
  ['.r', 'R'],
  ['.rb', 'Ruby'],
  ['.rs', 'Rust'],
  ['.scala', 'Scala'],
  ['.scss', 'CSS'],
  ['.sh', 'Shell'],
  ['.sql', 'SQL'],
  ['.swift', 'Swift'],
  ['.tex', 'TeX'],
  ['.toml', 'TOML'],
  ['.ts', 'TypeScript'],
  ['.tsx', 'TypeScript'],
  ['.xml', 'XML'],
  ['.yaml', 'YAML'],
  ['.yml', 'YAML']
])

type RepositoryScanResult = Pick<
  CodeRepositoryPreparationResult,
  'fileCount' | 'maxFiles' | 'scanLimitReached' | 'languageCounts' | 'importantFiles' | 'warnings'
>

type GitExecutionError = Error & {
  code?: string
  stderr?: string
  stdout?: string
  killed?: boolean
  signal?: string
}

export async function prepareCodeRepository(input: unknown): Promise<CodeRepositoryPreparationResult> {
  const parsedInput = parseCodeRepositoryPreparationInput(input)
  const normalized = normalizeGitHubRepositoryUrl(parsedInput.repositoryUrl)
  if (!normalized) {
    throw new Error('仅支持有效的 GitHub 仓库 URL，例如 https://github.com/owner/repo。')
  }

  const cacheRoot = join(app.getPath('userData'), 'code-analysis', 'repositories')
  const cacheKey = createRepositoryCacheKey(normalized.owner, normalized.repo, normalized.normalizedUrl)
  const cacheDir = join(cacheRoot, cacheKey)
  const warnings: string[] = []
  let cloned = false
  let reusedCache = false

  await mkdir(cacheRoot, { recursive: true })
  await runGit(['--version'], {
    timeoutMs: codeRepositoryGitTimeoutMs,
    sensitivePaths: [cacheRoot]
  })

  if (await pathExists(cacheDir)) {
    if (!(await isGitRepositoryCache(cacheDir))) {
      throw new Error(`仓库缓存 ${cacheKey} 已存在，但不是有效的 Git 仓库。请清理代码分析缓存后重试。`)
    }

    reusedCache = true
    warnings.push('已复用本地仓库缓存；初版不会自动更新远端最新提交。')
  } else {
    await runGit(['clone', '--depth=1', normalized.normalizedUrl, cacheDir], {
      timeoutMs: codeRepositoryCloneTimeoutMs,
      sensitivePaths: [cacheRoot, cacheDir]
    })
    cloned = true
  }

  const [commit, branch, scanResult] = await Promise.all([
    readOptionalGitOutput(['-C', cacheDir, 'rev-parse', '--short', 'HEAD'], cacheRoot),
    readOptionalGitOutput(['-C', cacheDir, 'branch', '--show-current'], cacheRoot),
    scanRepositoryFiles(cacheDir)
  ])

  return {
    repositoryUrl: parsedInput.repositoryUrl,
    normalizedUrl: normalized.normalizedUrl,
    owner: normalized.owner,
    repo: normalized.repo,
    cacheKey,
    cloned,
    reusedCache,
    commit: commit || undefined,
    branch: branch || undefined,
    fileCount: scanResult.fileCount,
    maxFiles: scanResult.maxFiles,
    scanLimitReached: scanResult.scanLimitReached,
    languageCounts: scanResult.languageCounts,
    importantFiles: scanResult.importantFiles,
    warnings: uniqueStrings([...warnings, ...scanResult.warnings])
  }
}

function parseCodeRepositoryPreparationInput(input: unknown): CodeRepositoryPreparationInput {
  if (!isRecord(input)) {
    throw new Error('代码仓库准备参数无效。')
  }

  return {
    paperPath: requireString(input.paperPath, 'paperPath'),
    repositoryUrl: requireString(input.repositoryUrl, 'repositoryUrl')
  }
}

async function runGit(
  args: string[],
  options: {
    timeoutMs: number
    sensitivePaths: string[]
  }
): Promise<string> {
  try {
    const result = await execFileAsync('git', args, {
      env: {
        ...process.env,
        GIT_ASKPASS: 'echo',
        GIT_TERMINAL_PROMPT: '0'
      },
      maxBuffer: 1024 * 1024 * 2,
      timeout: options.timeoutMs,
      windowsHide: true
    })
    return result.stdout.trim()
  } catch (error) {
    throw new Error(normalizeGitExecutionError(error, options.sensitivePaths))
  }
}

async function readOptionalGitOutput(args: string[], cacheRoot: string): Promise<string> {
  try {
    return await runGit(args, {
      timeoutMs: codeRepositoryGitTimeoutMs,
      sensitivePaths: [cacheRoot]
    })
  } catch {
    return ''
  }
}

function normalizeGitExecutionError(error: unknown, sensitivePaths: string[]): string {
  const gitError = error as GitExecutionError
  if (gitError?.code === 'ENOENT') {
    return '未找到 Git 命令。请先安装 Git，或确认 Git 已加入系统 PATH。'
  }

  if (gitError?.killed || gitError?.signal) {
    return 'Git 命令执行超时。可以稍后重试，或确认网络能够访问 GitHub。'
  }

  const rawMessage = [gitError?.stderr, gitError?.stdout, gitError instanceof Error ? gitError.message : '']
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n')
  const redactedMessage = redactSensitivePaths(rawMessage, sensitivePaths)
  return redactedMessage
    ? `Git 命令失败：${truncateText(redactedMessage, 1200)}`
    : 'Git 命令失败，但没有返回更多错误信息。'
}

async function scanRepositoryFiles(repositoryDir: string): Promise<RepositoryScanResult> {
  const warnings: string[] = []
  const languageCounts = new Map<string, number>()
  const importantFiles: CodeRepositoryImportantFile[] = []
  const pendingDirectories: Array<{ absolutePath: string; relativePath: string }> = [
    {
      absolutePath: repositoryDir,
      relativePath: ''
    }
  ]
  let fileCount = 0
  let scanLimitReached = false

  while (pendingDirectories.length > 0 && !scanLimitReached) {
    const currentDirectory = pendingDirectories.shift()
    if (!currentDirectory) {
      break
    }

    let entries: Dirent[]
    try {
      entries = await readdir(currentDirectory.absolutePath, { withFileTypes: true })
    } catch {
      warnings.push(`无法读取目录 ${currentDirectory.relativePath || '.'}，已跳过。`)
      continue
    }

    const sortedEntries = entries
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1
        }

        return left.name.localeCompare(right.name)
      })
    for (const entry of sortedEntries) {
        if (scanLimitReached) {
          break
        }

        const relativePath = currentDirectory.relativePath
          ? `${currentDirectory.relativePath}/${entry.name}`
          : entry.name
        const absolutePath = join(currentDirectory.absolutePath, entry.name)

        if (entry.isSymbolicLink()) {
          continue
        }

        if (entry.isDirectory()) {
          if (!shouldIgnoreRepositoryDirectory(entry.name)) {
            pendingDirectories.push({ absolutePath, relativePath })
          }
          continue
        }

        if (!entry.isFile()) {
          continue
        }

        fileCount += 1
        if (fileCount >= codeRepositoryScanMaxFiles) {
          scanLimitReached = true
        }

        const language = getRepositoryFileLanguage(relativePath)
        languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1)

        importantFiles.push(...(await classifyImportantRepositoryFile(relativePath, absolutePath)))
    }
  }

  if (scanLimitReached) {
    warnings.push(`仓库文件数超过 ${codeRepositoryScanMaxFiles}，初版只扫描前 ${codeRepositoryScanMaxFiles} 个文件。`)
  }

  const normalizedImportantFiles = importantFiles
    .sort(compareImportantRepositoryFiles)
    .slice(0, codeRepositoryImportantFileMaxCount)
  if (normalizedImportantFiles.length === 0) {
    warnings.push('没有识别到 README、入口脚本、配置文件或主要源码文件。')
  }

  return {
    fileCount,
    maxFiles: codeRepositoryScanMaxFiles,
    scanLimitReached,
    languageCounts: Object.fromEntries(
      [...languageCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    ),
    importantFiles: normalizedImportantFiles,
    warnings
  }
}

async function classifyImportantRepositoryFile(relativePath: string, absolutePath: string): Promise<CodeRepositoryImportantFile[]> {
  const kind = getImportantRepositoryFileKind(relativePath)
  if (!kind) {
    return []
  }

  let size = 0
  try {
    size = (await stat(absolutePath)).size
  } catch {
    size = 0
  }

  return [
    {
      path: relativePath,
      kind,
      size
    }
  ]
}

function getImportantRepositoryFileKind(relativePath: string): CodeRepositoryImportantFileKind | null {
  const lowerPath = relativePath.toLowerCase()
  const fileName = lowerPath.split('/').at(-1) ?? lowerPath
  const extension = getLowercaseFileExtension(fileName)

  if (/^readme(?:\b|[._-])/i.test(fileName)) {
    return 'readme'
  }

  if (configFileNames.has(fileName) || /^config\.(json|toml|ya?ml)$/i.test(fileName)) {
    return 'config'
  }

  if (entryFileNames.has(fileName)) {
    return 'entry'
  }

  if (extension === '.ipynb') {
    return 'notebook'
  }

  if (isScriptFile(fileName) || lowerPath.startsWith('scripts/')) {
    return 'script'
  }

  if (sourceExtensions.has(extension) && isSourceDirectoryPath(lowerPath)) {
    return 'source'
  }

  if (fileName === 'license' || fileName === 'citation.cff') {
    return 'other'
  }

  return null
}

function compareImportantRepositoryFiles(left: CodeRepositoryImportantFile, right: CodeRepositoryImportantFile): number {
  const kindDiff = getImportantRepositoryFilePriority(left.kind) - getImportantRepositoryFilePriority(right.kind)
  if (kindDiff !== 0) {
    return kindDiff
  }

  return left.path.localeCompare(right.path)
}

function getImportantRepositoryFilePriority(kind: CodeRepositoryImportantFileKind): number {
  if (kind === 'readme') {
    return 0
  }

  if (kind === 'config') {
    return 1
  }

  if (kind === 'entry') {
    return 2
  }

  if (kind === 'notebook') {
    return 3
  }

  if (kind === 'script') {
    return 4
  }

  if (kind === 'source') {
    return 5
  }

  return 6
}

function getRepositoryFileLanguage(relativePath: string): string {
  const fileName = relativePath.split('/').at(-1)?.toLowerCase() ?? relativePath.toLowerCase()
  if (fileName === 'dockerfile') {
    return 'Dockerfile'
  }

  if (fileName === 'makefile') {
    return 'Makefile'
  }

  return fileLanguageByExtension.get(getLowercaseFileExtension(fileName)) ?? 'Other'
}

function isSourceDirectoryPath(lowerPath: string): boolean {
  const firstSegment = lowerPath.split('/')[0] ?? ''
  return sourceDirectoryNames.has(firstSegment)
}

function isScriptFile(fileName: string): boolean {
  return fileName.endsWith('.sh') || fileName.endsWith('.ps1') || fileName.endsWith('.bat')
}

function getLowercaseFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

function shouldIgnoreRepositoryDirectory(directoryName: string): boolean {
  return ignoredRepositoryDirectoryNames.has(directoryName.toLowerCase())
}

async function isGitRepositoryCache(cacheDir: string): Promise<boolean> {
  try {
    const gitPathStat = await stat(join(cacheDir, '.git'))
    return gitPathStat.isDirectory() || gitPathStat.isFile()
  } catch {
    return false
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

function createRepositoryCacheKey(owner: string, repo: string, normalizedUrl: string): string {
  const hash = createHash('sha256').update(normalizedUrl.toLowerCase()).digest('hex').slice(0, 10)
  const ownerRepo = `${owner}-${repo}`
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return `${ownerRepo || 'repository'}-${hash}`
}

function requireString(input: unknown, fieldName: string): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`缺少 ${fieldName}。`)
  }

  return input.trim()
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object'
}

function redactSensitivePaths(input: string, sensitivePaths: string[]): string {
  return sensitivePaths.reduce((message, path) => {
    if (!path) {
      return message
    }

    const normalized = path.replace(/\\/g, '/')
    return message.split(path).join('[repository-cache]').split(normalized).join('[repository-cache]')
  }, input)
}

function truncateText(input: string, maxLength: number): string {
  return input.length > maxLength ? `${input.slice(0, maxLength)}...` : input
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}
