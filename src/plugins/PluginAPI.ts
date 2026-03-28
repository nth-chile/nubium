import type { Score } from "../model";
import type { CursorPosition } from "../input/InputState";

export interface Selection {
  partIndex: number;
  measureStart: number;
  measureEnd: number;
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
}
