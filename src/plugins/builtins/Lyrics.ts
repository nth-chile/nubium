import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { useEditorStore } from "../../state/EditorState";

export const LyricsPlugin: NotationPlugin = {
  id: "notation.lyrics",
  name: "Lyrics",
  version: "1.0.0",
  description: "Display and edit lyrics below notes",
  activate(api: PluginAPI) {
    useEditorStore.getState().setShowLyrics(true);

    api.registerCommand("notation.lyric-mode", "Enter lyric input", () => {
      useEditorStore.getState().enterLyricMode();
    });
  },
  deactivate() {
    useEditorStore.getState().setShowLyrics(false);
  },
};
