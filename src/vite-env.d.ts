/// <reference types="vite/client" />

// File System Access API (Chrome/Edge)
interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | BufferSource | Blob | { type: string; data?: string | BufferSource | Blob; position?: number; size?: number }): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  readonly kind: "file";
  readonly name: string;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface Window {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
}
