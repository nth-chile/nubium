import type { Score } from "../model";
import type { CursorPosition } from "../input/InputState";
import type {
  NotationPlugin,
  PluginAPI,
  Selection,
  PanelConfig,
  ViewRegistration,
  ImporterConfig,
  ExporterConfig,
} from "./PluginAPI";
import { serialize, deserialize } from "../serialization";

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

export interface PanelRegistration {
  id: string;
  pluginId: string;
  config: PanelConfig;
}

export interface ViewEntry {
  id: string;
  pluginId: string;
  config: ViewRegistration;
}

export interface ImporterEntry {
  id: string;
  pluginId: string;
  config: ImporterConfig;
}

export interface ExporterEntry {
  id: string;
  pluginId: string;
  config: ExporterConfig;
}

export interface PluginEntry {
  plugin: NotationPlugin;
  enabled: boolean;
  commands: PluginCommand[];
  shortcuts: PluginShortcut[];
  panels: PanelRegistration[];
  views: ViewEntry[];
  importers: ImporterEntry[];
  exporters: ExporterEntry[];
}

type ScoreGetter = () => Score;
type ScoreApplier = (score: Score) => void;
type CursorGetter = () => CursorPosition;
type SelectionGetter = () => Selection | null;
type NotificationShower = (message: string, type?: "info" | "error" | "success") => void;

const STORAGE_KEY = "notation-plugin-states";

function loadPluginStates(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function savePluginStates(states: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    // ignore
  }
}

export class PluginManager {
  private plugins: Map<string, PluginEntry> = new Map();
  private commandRegistry: Map<string, PluginCommand> = new Map();
  private shortcutRegistry: Map<string, string> = new Map(); // keys -> commandId
  private panelRegistry: Map<string, PanelRegistration> = new Map();
  private viewRegistry: Map<string, ViewEntry> = new Map();
  private importerRegistry: Map<string, ImporterEntry> = new Map();
  private exporterRegistry: Map<string, ExporterEntry> = new Map();
  private listeners: Set<() => void> = new Set();

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

  /** Subscribe to changes (plugin enable/disable, registrations) */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
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
      registerPanel: (id: string, config: PanelConfig) => {
        const reg: PanelRegistration = { id, pluginId, config };
        this.panelRegistry.set(id, reg);
        if (entry) {
          entry.panels.push(reg);
        }
      },
      registerView: (id: string, config: ViewRegistration) => {
        const reg: ViewEntry = { id, pluginId, config };
        this.viewRegistry.set(id, reg);
        if (entry) {
          entry.views.push(reg);
        }
      },
      registerImporter: (id: string, config: ImporterConfig) => {
        const reg: ImporterEntry = { id, pluginId, config };
        this.importerRegistry.set(id, reg);
        if (entry) {
          entry.importers.push(reg);
        }
      },
      registerExporter: (id: string, config: ExporterConfig) => {
        const reg: ExporterEntry = { id, pluginId, config };
        this.exporterRegistry.set(id, reg);
        if (entry) {
          entry.exporters.push(reg);
        }
      },
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
      panels: [],
      views: [],
      importers: [],
      exporters: [],
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

    // Persist state
    const states = loadPluginStates();
    states[pluginId] = true;
    savePluginStates(states);

    this.notify();
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
    // Remove panels, views, importers, exporters
    for (const panel of entry.panels) {
      this.panelRegistry.delete(panel.id);
    }
    for (const view of entry.views) {
      this.viewRegistry.delete(view.id);
    }
    for (const importer of entry.importers) {
      this.importerRegistry.delete(importer.id);
    }
    for (const exporter of entry.exporters) {
      this.exporterRegistry.delete(exporter.id);
    }

    entry.commands = [];
    entry.shortcuts = [];
    entry.panels = [];
    entry.views = [];
    entry.importers = [];
    entry.exporters = [];

    entry.plugin.deactivate?.();
    entry.enabled = false;

    // Persist state
    const states = loadPluginStates();
    states[pluginId] = false;
    savePluginStates(states);

    this.notify();
  }

  /** Register and activate a plugin, respecting persisted enable/disable state.
   *  If defaultEnabled is true and there's no persisted state, it will be activated.
   */
  registerAndActivate(plugin: NotationPlugin, defaultEnabled: boolean = true): void {
    this.register(plugin);
    const states = loadPluginStates();
    const shouldEnable = states[plugin.id] !== undefined ? states[plugin.id] : defaultEnabled;
    if (shouldEnable) {
      this.activate(plugin.id);
    }
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

  // Panel registry
  getPanels(location?: PanelRegistration["config"]["location"]): PanelRegistration[] {
    const all = Array.from(this.panelRegistry.values());
    if (location) {
      return all.filter((p) => p.config.location === location);
    }
    return all;
  }

  // View registry
  getViews(): ViewEntry[] {
    return Array.from(this.viewRegistry.values());
  }

  // Importer registry
  getImporters(): ImporterEntry[] {
    return Array.from(this.importerRegistry.values());
  }

  // Exporter registry
  getExporters(): ExporterEntry[] {
    return Array.from(this.exporterRegistry.values());
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
