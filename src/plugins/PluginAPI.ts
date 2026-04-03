import type { Score } from "../model";
import type { CursorPosition } from "../input/InputState";
import type { ViewConfig } from "../views/ViewMode";

export interface Selection {
  partIndex: number;
  measureStart: number;
  measureEnd: number;
}

export interface NoteSelection {
  partIndex: number;
  voiceIndex: number;
  /** Start of selection (inclusive) */
  startMeasure: number;
  startEvent: number;
  /** End of selection (inclusive) */
  endMeasure: number;
  endEvent: number;
  /** Anchor position — the fixed end. Left/right move the other end. */
  anchorMeasure: number;
  anchorEvent: number;
  /** @deprecated single-measure compat — use startMeasure */
  measureIndex?: number;
}

export interface PanelMenuItem {
  label: string;
  onClick: () => void;
}

export interface PanelConfig {
  title: string;
  location: "sidebar-left" | "sidebar-right" | "toolbar" | "bottom";
  component: () => React.ReactNode;
  defaultEnabled?: boolean;
  menuItems?: PanelMenuItem[];
  /** When true, the panel fills remaining sidebar height instead of sizing to content */
  fill?: boolean;
}

export interface ViewRegistration {
  name: string;
  icon: string;
  getViewConfig: () => ViewConfig;
}

export interface ImporterConfig {
  name: string;
  extensions: string[];
  import: (content: string) => Score;
}

export interface ExporterConfig {
  name: string;
  extension: string;
  export: (score: Score) => string;
}

export interface PlaybackService {
  play(score: Score): Promise<void>;
  pause(): void;
  stop(): void;
  setTempo(bpm: number): void;
  setMetronome(enabled: boolean): void;
  updateScore(score: Score): void;
  setCallbacks(opts: {
    onTick: (tick: number) => void;
    onStateChange: (state: string) => void;
  }): void;
}

export interface NotationPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  activate(api: PluginAPI): void;
  deactivate?(): void;
}

export interface PluginAPI {
  // Score access (read-only clones)
  getScore(): Score;
  getSelection(): Selection | null;
  getCursorPosition(): CursorPosition;

  // Score mutation (goes through command system)
  applyScore(newScore: Score): void;

  // Command registration
  registerCommand(id: string, label: string, handler: () => void): void;

  // Keyboard shortcut registration
  registerShortcut(keys: string, commandId: string): void;

  // UI
  showNotification(message: string, type?: "info" | "error" | "success"): void;

  // Serialization helpers
  serialize(score: Score): string;
  deserialize(text: string): Score;

  // UI panels
  registerPanel(id: string, config: PanelConfig): void;

  // View modes
  registerView(id: string, config: ViewRegistration): void;

  // File importers/exporters
  registerImporter(id: string, config: ImporterConfig): void;
  registerExporter(id: string, config: ExporterConfig): void;

  // Plugin settings UI
  registerSettings(component: () => React.ReactNode): void;

  // Plugin-scoped persistent storage
  getStorage<T = unknown>(key: string): T | undefined;
  setStorage<T = unknown>(key: string, value: T): void;

  // Service registration
  registerPlaybackService(service: PlaybackService): void;
}
