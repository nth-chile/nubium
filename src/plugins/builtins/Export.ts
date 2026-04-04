import type { NubiumPlugin, PluginAPI } from "../PluginAPI";

export const ExportPlugin: NubiumPlugin = {
  id: "nubium.export",
  name: "PDF Export",
  version: "1.0.0",
  description: "Export score as PDF",

  activate(api: PluginAPI) {
    api.registerCommand("nubium.export-pdf", "Export as PDF", () => {
      const score = api.getScore();
      import("../../fileio/pdf").then(({ exportPDF }) => {
        exportPDF(score).catch((err) => console.error("PDF export failed:", err));
      });
    });

    api.registerCommand("nubium.export-part-pdf", "Export Current Part as PDF", () => {
      const score = api.getScore();
      const { partIndex } = api.getCursorPosition();
      import("../../fileio/pdf").then(({ exportPartPDF }) => {
        exportPartPDF(score, partIndex).catch((err) => console.error("PDF export failed:", err));
      });
    });
  },
};
