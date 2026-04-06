export type {
  NubiumPlugin,
  PluginAPI,
  PlaybackService,
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
export { ChordAnalysisPlugin } from "./builtins/ChordAnalysis";

// Built-in feature plugins
export { ViewsPlugin } from "./builtins/Views";
export { ExportPlugin } from "./builtins/Export";
export { BuiltinInstrumentsPlugin, registerCoreTransport } from "./builtins/Playback";
export { AIChatPlugin } from "./builtins/AIChat";
export { registerCorePartManager } from "./builtins/PartManager";
export { registerCoreEditor } from "./builtins/ScoreEditor";
export { ClipboardPlugin } from "./builtins/Clipboard";
export { MidiInputPlugin } from "./builtins/MidiInput";

// Community plugin registry
export {
  fetchRegistry,
  installPlugin,
  uninstallPlugin,
  isInstalled,
  isCommunityPluginsEnabled,
  enableCommunityPlugins,
  loadAllInstalled,
  loadPluginFromBundle,
} from "./CommunityRegistry";
export type { RegistryEntry } from "./CommunityRegistry";
