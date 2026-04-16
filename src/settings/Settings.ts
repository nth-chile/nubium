import { type KeyBinding, defaultKeyBindings, migrateKeyBindings } from "./keybindings";

export interface DisplaySettings {
  showLyrics: boolean;
  showChordSymbols: boolean;
  showRehearsalMarks: boolean;
  showTempoMarks: boolean;
  showDynamics: boolean;
  showStandardToggle: boolean;
  showTabToggle: boolean;
  showSlashToggle: boolean;
}

export interface AppSettings {
  metronomeEnabled: boolean;
  countInEnabled: boolean;
  historyMaxSnapshots: number;
  keyBindings: Record<string, KeyBinding>;
  viewMode: string;
  display: DisplaySettings;
  pitchBeforeDuration: boolean;
  startInInsertMode: boolean;
  followPlaybackCursor: boolean;
  scoreZoom: number;
  telemetryOptOut: boolean;
}

const STORAGE_KEY = "nubium-settings";
const CONFIG_FILENAME = "settings.json";

// Set VITE_CLEAN_SETTINGS=1 to simulate a fresh install without touching your real config
const SIMULATE_FRESH_INSTALL = import.meta.env.VITE_CLEAN_SETTINGS === "1";

function defaultDisplaySettings(): DisplaySettings {
  return {
    showLyrics: true,
    showChordSymbols: true,
    showRehearsalMarks: true,
    showTempoMarks: true,
    showDynamics: true,
    showStandardToggle: true,
    showTabToggle: true,
    showSlashToggle: true,
  };
}

function defaultSettings(): AppSettings {
  return {
    metronomeEnabled: false,
    countInEnabled: false,
    historyMaxSnapshots: 50,
    keyBindings: defaultKeyBindings(),
    viewMode: "full-score",
    display: defaultDisplaySettings(),
    pitchBeforeDuration: false,
    startInInsertMode: false,
    followPlaybackCursor: true,
    scoreZoom: 1,
    telemetryOptOut: false,
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
        const mergedBindings = migrateKeyBindings({ ...defaultKeyBindings(), ...(parsed.keyBindings ?? {}) });
        const mergedDisplay = { ...defaultDisplaySettings(), ...(parsed.display ?? {}) };
        currentSettings = { ...defaultSettings(), ...parsed, keyBindings: mergedBindings, display: mergedDisplay };
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
      const mergedBindings = migrateKeyBindings({ ...defaultKeyBindings(), ...(fileSettings.keyBindings ?? {}) });
      const mergedDisplay = { ...defaultDisplaySettings(), ...(fileSettings.display ?? {}) };
      currentSettings = { ...defaultSettings(), ...fileSettings, keyBindings: mergedBindings, display: mergedDisplay };
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

export { defaultSettings, defaultDisplaySettings };
