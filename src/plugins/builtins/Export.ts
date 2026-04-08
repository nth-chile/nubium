import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import { useEditorStore } from "../../state";

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: filename, filters: [{ name: "Audio", extensions: ["wav"] }] });
    if (path) {
      const buffer = await blob.arrayBuffer();
      await writeFile(path, new Uint8Array(buffer));
    }
  } catch {
    // Browser fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const ExportPlugin: NubiumPlugin = {
  id: "nubium.export",
  name: "Export",
  version: "1.0.0",
  description: "Export score as PDF or WAV audio",

  activate(api: PluginAPI) {
    api.registerCommand("nubium.export-pdf", "Export as PDF", () => {
      const score = api.getScore();
      const viewConfig = useEditorStore.getState().viewConfig;
      import("../../fileio/pdf").then(({ exportPDF }) => {
        exportPDF(score, viewConfig).catch((err) => console.error("PDF export failed:", err));
      });
    });

    api.registerCommand("nubium.export-part-pdf", "Export Current Part as PDF", () => {
      const score = api.getScore();
      const { partIndex } = api.getCursorPosition();
      const viewConfig = useEditorStore.getState().viewConfig;
      import("../../fileio/pdf").then(({ exportPartPDF }) => {
        exportPartPDF(score, partIndex, viewConfig).catch((err) => console.error("PDF export failed:", err));
      });
    });

    api.registerCommand("nubium.export-wav", "Export as WAV Audio", async () => {
      const score = api.getScore();
      const filename = (score.title || "export").replace(/[^a-zA-Z0-9_-]/g, "_") + ".wav";
      try {
        const { exportToWav } = await import("../../fileio/audio");
        const blob = await exportToWav(score);
        await saveBlob(blob, filename);
      } catch (err) {
        console.error("WAV export failed:", err);
      }
    });
  },
};
