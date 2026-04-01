import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { exportToMusicXML } from "../../musicxml/export";

export const ExportPlugin: NotationPlugin = {
  id: "notation.export",
  name: "Export",
  version: "1.0.0",
  description: "Export score as PDF or MusicXML download",

  activate(api: PluginAPI) {
    api.registerCommand("notation.export-musicxml", "Export as MusicXML", () => {
      const score = api.getScore();
      const content = exportToMusicXML(score);
      const blob = new Blob([content], { type: "application/vnd.recordare.musicxml+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${score.title || "Untitled"}.musicxml`;
      a.click();
      URL.revokeObjectURL(url);
    });

    api.registerCommand("notation.export-pdf", "Export as PDF", () => {
      const score = api.getScore();
      import("../../fileio/pdf").then(({ exportPDF }) => {
        exportPDF(score).catch((err) => console.error("PDF export failed:", err));
      });
    });

    api.registerCommand("notation.export-part-pdf", "Export Current Part as PDF", () => {
      const score = api.getScore();
      const { partIndex } = api.getCursorPosition();
      import("../../fileio/pdf").then(({ exportPartPDF }) => {
        exportPartPDF(score, partIndex).catch((err) => console.error("PDF export failed:", err));
      });
    });

  },
};
