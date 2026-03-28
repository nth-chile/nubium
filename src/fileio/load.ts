import { deserialize } from "../serialization";
import type { Score } from "../model";

export async function loadScore(): Promise<{ score: Score; path: string } | null> {
  // Try Tauri native file dialog
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const path = await open({
      filters: [{ name: "Notation", extensions: ["notation"] }],
      multiple: false,
    });

    if (!path) return null;

    const content = await readTextFile(path as string);
    const score = deserialize(content);
    return { score, path: path as string };
  } catch {
    // Fallback: browser file input
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".notation";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const text = await file.text();
        const score = deserialize(text);
        resolve({ score, path: file.name });
      };
      input.click();
    });
  }
}
