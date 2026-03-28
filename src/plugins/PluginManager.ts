import type { Score } from "../model";
import type { CursorPosition } from "../input/InputState";
import type { NotationPlugin, PluginAPI, Selection } from "./PluginAPI";
import { serialize } from "../serialization/serialize";
import { deserialize } from "../serialization/deserialize";

export interface PluginCommand {
  id: string;
  label: string;
  pluginId: string;
  handler: () => void;
}

export interface PluginShortcut {
  keys: string;
  commandId: string;
}

export interface PluginEntry {
  plugin: NotationPlugin;
  enabled: boolean;
  commands: PluginCommand[];
  shortcuts: PluginShortcut[];
}

type ScoreGetter = () => Score;
type ScoreApplier = (score: Score) => void;
type CursorGetter = () => CursorPosition;
type SelectionGetter = () => Selection | null;
type NotificationShower = (message: string, type?: "info" | "error" | "success") => void;

export class PluginManager {
  private plugins: Map<string, PluginEntry> = new Map();
  private commandRegistry: Map<string, PluginCommand> = new Map();
  private shortcutRegistry: Map<string, string> = new Map(); // keys -> commandId

  private getScore: ScoreGetter;
  private applyScore: ScoreApplier;
  private getCursor: CursorGetter;
  private getSelection: SelectionGetter;
  private showNotification: NotificationShower;

  constructor(opts: {
    getScore: ScoreGetter;
    applyScore: ScoreApplier;
    getCursor: CursorGetter;
    getSelection: SelectionGetter;
    showNotification: NotificationShower;
  }) {
    this.getScore = opts.getScore;
    this.applyScore = opts.applyScore;
    this.getCursor = opts.getCursor;
    this.getSelection = opts.getSelection;
    this.showNotification = opts.showNotification;
  }

  private createAPI(pluginId: string): PluginAPI {
    const entry = this.plugins.get(pluginId);
    return {
      getScore: () => structuredClone(this.getScore()),
      getSelection: () => this.getSelection(),
      getCursorPosition: () => ({ ...this.getCursor() }),
      applyScore: (newScore: Score) => this.applyScore(newScore),
      registerCommand: (id: string, label: string, handler: () => void) => {
        const cmd: PluginCommand = { id, label, pluginId, handler };
        this.commandRegistry.set(id, cmd);
        if (entry) {
          entry.commands.push(cmd);
        }
      },
      registerShortcut: (keys: string, commandId: string) => {
        this.shortcutRegistry.set(keys, commandId);
        if (entry) {
          entry.shortcuts.push({ keys, commandId });
        }
      },
      showNotification: (message: string, type?: "info" | "error" | "success") => {
        this.showNotification(message, type);
      },
      serialize: (score: Score) => serialize(score),
      deserialize: (text: string) => deserialize(text),
    };
  }

  register(plugin: NotationPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin "${plugin.id}" is already registered.`);
      return;
    }
    this.plugins.set(plugin.id, {
      plugin,
      enabled: false,
      commands: [],
      shortcuts: [],
    });
  }

  activate(pluginId: string): void {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      console.warn(`Plugin "${pluginId}" not found.`);
      return;
    }
    if (entry.enabled) return;

    const api = this.createAPI(pluginId);
    entry.plugin.activate(api);
    entry.enabled = true;
  }

  deactivate(pluginId: string): void {
    const entry = this.plugins.get(pluginId);
    if (!entry || !entry.enabled) return;

    // Remove commands and shortcuts
    for (const cmd of entry.commands) {
      this.commandRegistry.delete(cmd.id);
    }
    for (const shortcut of entry.shortcuts) {
      this.shortcutRegistry.delete(shortcut.keys);
    }
    entry.commands = [];
    entry.shortcuts = [];

    entry.plugin.deactivate?.();
    entry.enabled = false;
  }

  getPlugins(): PluginEntry[] {
    return Array.from(this.plugins.values());
  }

  getCommands(): PluginCommand[] {
    return Array.from(this.commandRegistry.values());
  }

  getCommand(id: string): PluginCommand | undefined {
    return this.commandRegistry.get(id);
  }

  executeCommand(id: string): boolean {
    const cmd = this.commandRegistry.get(id);
    if (!cmd) return false;
    cmd.handler();
    return true;
  }

  getShortcutCommand(keys: string): string | undefined {
    return this.shortcutRegistry.get(keys);
  }

  /** Handle a keyboard event, return true if a plugin shortcut matched */
  handleKeyEvent(e: KeyboardEvent): boolean {
    const keys = this.eventToKeys(e);
    const commandId = this.shortcutRegistry.get(keys);
    if (commandId) {
      return this.executeCommand(commandId);
    }
    return false;
  }

  private eventToKeys(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(key);
    return parts.join("+");
  }
}
