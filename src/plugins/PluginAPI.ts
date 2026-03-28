import type { Score } from "../model";
import type { CursorPosition } from "../input/InputState";
import type { ViewConfig } from "../views/ViewMode";

export interface Selection {
  partIndex: number;
  measureStart: number;
  measureEnd: number;
}

export interface PanelConfig {
  title: string;
  location: "sidebar-left" | "sidebar-right" | "toolbar" | "bottom";
  component: () => React.ReactNode;
  defaultEnabled?: boolean;
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
}
