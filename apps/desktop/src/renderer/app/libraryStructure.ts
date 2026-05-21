import type { LibraryFolder, LibraryStructure } from './types'

const fallbackFolderName = '新建文件夹'

export function createEmptyLibraryStructure(): LibraryStructure {
  return {
    folderOrder: [],
    foldersById: {}
  }
}

export function pruneLibraryStructure(structure: LibraryStructure, libraryPdfPaths: string[]): LibraryStructure {
  const knownPdfPathSet = new Set(libraryPdfPaths)
  const requestedFolderOrder = uniqueStrings(structure.folderOrder)
  const fallbackFolderOrder = Object.keys(structure.foldersById)
  const folderOrder = [...requestedFolderOrder, ...fallbackFolderOrder.filter((folderId) => !requestedFolderOrder.includes(folderId))]
  const assignedPdfPaths = new Set<string>()
  const foldersById: Record<string, LibraryFolder> = {}

  folderOrder.forEach((folderId) => {
    const folder = structure.foldersById[folderId]
    if (!folder) {
      return
    }

    const pdfPaths = uniqueStrings(folder.pdfPaths).filter((filePath) => {
      if (!knownPdfPathSet.has(filePath) || assignedPdfPaths.has(filePath)) {
        return false
      }

      assignedPdfPaths.add(filePath)
      return true
    })

    foldersById[folderId] = {
      id: folderId,
      name: sanitizeFolderName(folder.name),
      expanded: folder.expanded !== false,
      pdfPaths
    }
  })

  return {
    folderOrder: folderOrder.filter((folderId) => Boolean(foldersById[folderId])),
    foldersById
  }
}

export function createLibraryFolder(structure: LibraryStructure, name: string): LibraryStructure {
  const folderId = createLibraryFolderId()

  return {
    folderOrder: [...structure.folderOrder, folderId],
    foldersById: {
      ...structure.foldersById,
      [folderId]: {
        id: folderId,
        name: sanitizeFolderName(name),
        expanded: true,
        pdfPaths: []
      }
    }
  }
}

export function toggleLibraryFolderExpanded(structure: LibraryStructure, folderId: string): LibraryStructure {
  const folder = structure.foldersById[folderId]
  if (!folder) {
    return structure
  }

  return {
    ...structure,
    foldersById: {
      ...structure.foldersById,
      [folderId]: {
        ...folder,
        expanded: !folder.expanded
      }
    }
  }
}

export function movePdfToLibraryFolder(structure: LibraryStructure, filePath: string, folderId: string): LibraryStructure {
  const targetFolder = structure.foldersById[folderId]
  if (!targetFolder) {
    return structure
  }

  const nextStructure = removePdfFromLibraryStructure(structure, filePath)
  const nextFolder = nextStructure.foldersById[folderId]
  if (!nextFolder || nextFolder.pdfPaths.includes(filePath)) {
    return nextStructure
  }

  return {
    ...nextStructure,
    foldersById: {
      ...nextStructure.foldersById,
      [folderId]: {
        ...nextFolder,
        expanded: true,
        pdfPaths: [...nextFolder.pdfPaths, filePath]
      }
    }
  }
}

export function movePdfToLibraryRoot(structure: LibraryStructure, filePath: string): LibraryStructure {
  return removePdfFromLibraryStructure(structure, filePath)
}

export function removePdfFromLibraryStructure(structure: LibraryStructure, filePath: string): LibraryStructure {
  let changed = false
  const foldersById = Object.fromEntries(
    Object.entries(structure.foldersById).map(([folderId, folder]) => {
      if (!folder.pdfPaths.includes(filePath)) {
        return [folderId, folder] as const
      }

      changed = true
      return [
        folderId,
        {
          ...folder,
          pdfPaths: folder.pdfPaths.filter((currentPath) => currentPath !== filePath)
        }
      ] as const
    })
  )

  return changed
    ? {
        ...structure,
        foldersById
      }
    : structure
}

export function getRootLibraryPdfPaths(structure: LibraryStructure, libraryPdfPaths: string[]): string[] {
  const assignedPdfPaths = new Set(Object.values(structure.foldersById).flatMap((folder) => folder.pdfPaths))
  return libraryPdfPaths.filter((filePath) => !assignedPdfPaths.has(filePath))
}

function sanitizeFolderName(name: string): string {
  const trimmed = name.trim().slice(0, 120)
  return trimmed || fallbackFolderName
}

function createLibraryFolderId(): string {
  return `library_folder_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter((item) => item.length > 0))]
}
