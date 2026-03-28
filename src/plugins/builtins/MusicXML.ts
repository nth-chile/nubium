import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { importFromMusicXML } from "../../musicxml/import";
import { exportToMusicXML } from "../../musicxml/export";

export const MusicXMLPlugin: NotationPlugin = {
  id: "notation.musicxml",
  name: "MusicXML",
  version: "1.0.0",
  description: "Import and export MusicXML files",

  activate(api: PluginAPI) {
    api.registerImporter("musicxml.import", {
      name: "MusicXML",
      extensions: [".musicxml", ".xml"],
      import: (content: string) => importFromMusicXML(content),
    });

    api.registerExporter("musicxml.export", {
      name: "MusicXML",
      extension: ".musicxml",
      export: (score) => exportToMusicXML(score),
    });

    api.registerCommand("notation.export-musicxml", "Export as MusicXML", () => {
      const score = api.getScore();
      const content = exportToMusicXML(score);
      // Trigger download
      const blob = new Blob([content], { type: "application/vnd.recordare.musicxml+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${score.title || "Untitled"}.musicxml`;
      a.click();
      URL.revokeObjectURL(url);
      api.showNotification("Exported MusicXML", "success");
    });
  },
};
