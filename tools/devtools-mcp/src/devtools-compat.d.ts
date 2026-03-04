/**
 * Type declarations for deprecated Chrome-specific File System APIs
 * used by chrome-devtools-frontend's InspectorFrontendHostStub.ts.
 *
 * These are not part of standard DOM types but are available in
 * Chrome's DevTools runtime environment.
 */

// The DevTools frontend code uses legacy File System API types (Entry,
// DirectoryEntry) that map to the newer FileSystemEntry/FileSystemDirectoryEntry
// but include deprecated methods like .remove() and .removeRecursively().
// We declare these as ambient classes matching the legacy API shape.

declare class Entry {
  readonly filesystem: FileSystem;
  readonly fullPath: string;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly name: string;
  remove(
    successCallback: () => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

declare class DirectoryEntry extends Entry {
  createReader(): DirectoryReader;
  getDirectory(
    path?: string | null,
    options?: {create?: boolean; exclusive?: boolean},
    successCallback?: (entry: DirectoryEntry) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
  getFile(
    path?: string | null,
    options?: {create?: boolean; exclusive?: boolean},
    successCallback?: (entry: FileEntry) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
  removeRecursively(
    successCallback: () => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

declare class FileEntry extends Entry {
  file(
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

// Extend the standard DOM FileSystemEntry to include deprecated .remove()
// which is still used by DevTools frontend code.
interface FileSystemEntry {
  remove(
    successCallback: () => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface FileSystemDirectoryEntry {
  removeRecursively(
    successCallback: () => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface Window {
  webkitRequestFileSystem(
    type: number,
    size: number,
    successCallback: (fs: FileSystem) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
  TEMPORARY: number;
}
