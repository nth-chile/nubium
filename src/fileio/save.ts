import { exportToMusicXML } from "../musicxml";
import type { Score } from "../model";
import type { ViewConfig } from "../views/ViewMode";

export interface SaveResult {
  path: string;
  handle?: FileSystemFileHandle;
}

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function saveScore(
  score: Score,
  filePath?: string,
  viewConfig?: ViewConfig,
  forceDialog = false,
  fileHandle?: FileSystemFileHandle | null,
): Promise<SaveResult> {
  const content = exportToMusicXML(score, viewConfig);

  if (isTauri()) {
    return saveTauri(content, score.title, filePath, forceDialog);
  }

  if ("showSaveFilePicker" in window) {
    return saveFSAccess(content, score.title, forceDialog, fileHandle);
  }

  return saveBlobDownload(content, score.title, filePath, forceDialog);
}

async function saveTauri(content: string, title: string | undefined, filePath?: string, forceDialog = false): Promise<SaveResult> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");

  let path: string | null | undefined;
  if (filePath && !forceDialog) {
    path = filePath;
  } else {
    path = await save({
      filters: [{ name: "MusicXML", extensions: ["musicxml"] }],
      defaultPath: filePath ?? `${title || "Untitled"}.musicxml`,
    });
  }

  if (!path) throw new Error("Save cancelled");

  await writeTextFile(path, content);
  return { path };
}

async function saveFSAccess(
  content: string,
  title: string | undefined,
  forceDialog: boolean,
  existingHandle?: FileSystemFileHandle | null,
): Promise<SaveResult> {
  let handle = existingHandle;

  if (handle && !forceDialog) {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return { path: handle.name, handle };
  }

  // Throws AbortError if user cancels
  handle = await window.showSaveFilePicker({
    suggestedName: `${title || "Untitled"}.musicxml`,
    types: [{ description: "MusicXML", accept: { "application/vnd.recordare.musicxml+xml": [".musicxml"] } }],
  });

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return { path: handle.name, handle };
}

function saveBlobDownload(content: string, title: string | undefined, filePath?: string, forceDialog = false): SaveResult {
  // Already confirmed — no-op in browser (can't write silently, but don't pester with downloads)
  if (filePath && !forceDialog) {
    return { path: filePath };
  }

  const blob = new Blob([content], { type: "application/vnd.recordare.musicxml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "Untitled"}.musicxml`;
  a.click();
  URL.revokeObjectURL(url);
  return { path: a.download };
}
