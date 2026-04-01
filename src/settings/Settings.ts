import type { ClefType } from "../model/time";
import { type KeyBinding, defaultKeyBindings } from "./keybindings";

export interface AppSettings {
  defaultTempo: number;
  defaultTimeSignature: { numerator: number; denominator: number };
  defaultClef: ClefType;
  autoBeam: boolean;
  playbackEnabled: boolean;
  metronomeEnabled: boolean;
  aiProvider: "anthropic" | "openai";
  theme: "light" | "dark";
  historyMaxSnapshots: number;
  keyBindings: Record<string, KeyBinding>;
  viewMode: string;
}

const STORAGE_KEY = "notation-settings";
const CONFIG_FILENAME = "settings.json";

// Set VITE_CLEAN_SETTINGS=1 to simulate a fresh install without touching your real config
const SIMULATE_FRESH_INSTALL = import.meta.env.VITE_CLEAN_SETTINGS === "1";

function defaultSettings(): AppSettings {
  return {
    defaultTempo: 120,
    defaultTimeSignature: { numerator: 4, denominator: 4 },
    defaultClef: "treble",
    autoBeam: true,
    playbackEnabled: true,
    metronomeEnabled: false,
    aiProvider: "anthropic",
    theme: "light",
    historyMaxSnapshots: 50,
    keyBindings: defaultKeyBindings(),
    viewMode: "full-score",
  };
}

let currentSettings: AppSettings | null = null;
const listeners: Set<(settings: AppSettings) => void> = new Set();

// Whether we've confirmed Tauri fs is available
let tauriAvailable: boolean | null = null;

async function getTauriFsModules() {
  if (tauriAvailable === false) return null;
  try {
    const [fs, path] = await Promise.all([
      import("@tauri-apps/plugin-fs"),
      import("@tauri-apps/api/path"),
    ]);
    tauriAvailable = true;
    return { fs, path };
  } catch {
    tauriAvailable = false;
    return null;
  }
}

async function readConfigFile(): Promise<AppSettings | null> {
  if (SIMULATE_FRESH_INSTALL) return null;
  const tauri = await getTauriFsModules();
  if (!tauri) return null;

  try {
    const configDir = await tauri.path.appConfigDir();
    const filePath = `${configDir}${CONFIG_FILENAME}`;
    const content = await tauri.fs.readTextFile(filePath);
    return JSON.parse(content) as AppSettings;
  } catch {
    return null;
  }
}

async function writeConfigFile(settings: AppSettings): Promise<boolean> {
  if (SIMULATE_FRESH_INSTALL) return false;
  const tauri = await getTauriFsModules();
  if (!tauri) return false;

  try {
    const configDir = await tauri.path.appConfigDir();
    // Ensure the config directory exists
    await tauri.fs.mkdir(configDir, { recursive: true });
    const filePath = `${configDir}${CONFIG_FILENAME}`;
    await tauri.fs.writeTextFile(filePath, JSON.stringify(settings, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function getSettings(): AppSettings {
  if (currentSettings) return currentSettings;

  // Synchronous load from localStorage (fast, always available)
  if (SIMULATE_FRESH_INSTALL) {
    currentSettings = defaultSettings();
  } else {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge keybindings: defaults + stored, so new keybindings aren't lost
        const mergedBindings = { ...defaultKeyBindings(), ...(parsed.keyBindings ?? {}) };
        currentSettings = { ...defaultSettings(), ...parsed, keyBindings: mergedBindings };
      } else {
        currentSettings = defaultSettings();
      }
    } catch {
      currentSettings = defaultSettings();
    }
  }

  // Async: try to load from config file (takes priority if it exists)
  readConfigFile().then((fileSettings) => {
    if (fileSettings) {
      const mergedBindings = { ...defaultKeyBindings(), ...(fileSettings.keyBindings ?? {}) };
      currentSettings = { ...defaultSettings(), ...fileSettings, keyBindings: mergedBindings };
      // Sync localStorage with config file
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
      } catch { /* ignore */ }
      for (const listener of listeners) {
        listener(currentSettings!);
      }
    } else if (currentSettings) {
      // No config file yet — write current settings to create one
      writeConfigFile(currentSettings);
    }
  });

  return currentSettings!;
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  currentSettings = { ...current, ...partial };

  // Write to localStorage (synchronous, immediate)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
  } catch { /* ignore */ }

  // Write to config file (async, durable)
  writeConfigFile(currentSettings);

  for (const listener of listeners) {
    listener(currentSettings);
  }

  return currentSettings;
}

export function resetSettings(): AppSettings {
  currentSettings = defaultSettings();

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }

  // Write defaults to config file
  writeConfigFile(currentSettings);

  for (const listener of listeners) {
    listener(currentSettings);
  }
  return currentSettings;
}

export function subscribeSettings(listener: (settings: AppSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export { defaultSettings };
