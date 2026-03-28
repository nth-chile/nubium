export type {
  NotationPlugin,
  PluginAPI,
  Selection,
  PanelConfig,
  ViewRegistration,
  ImporterConfig,
  ExporterConfig,
} from "./PluginAPI";
export { PluginManager } from "./PluginManager";
export type {
  PluginCommand,
  PluginEntry,
  PluginShortcut,
  PanelRegistration,
  ViewEntry,
  ImporterEntry,
  ExporterEntry,
} from "./PluginManager";

// Built-in transform plugins
export { TransposePlugin } from "./builtins/Transpose";
export { RetrogradePlugin } from "./builtins/Retrograde";
export { AugmentPlugin } from "./builtins/Augment";
export { ChordAnalysisPlugin } from "./builtins/ChordAnalysis";

// Built-in feature plugins
export { ViewsPlugin } from "./builtins/Views";
export { MusicXMLPlugin } from "./builtins/MusicXML";
export { PlaybackPlugin } from "./builtins/Playback";
export { AIChatPlugin } from "./builtins/AIChat";
export { PartManagerPlugin } from "./builtins/PartManager";
export { ScoreEditorPlugin } from "./builtins/ScoreEditor";
