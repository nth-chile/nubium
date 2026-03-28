import type { ClefType } from "../model/time";

export interface AppSettings {
  defaultTempo: number;
  defaultTimeSignature: { numerator: number; denominator: number };
  defaultClef: ClefType;
  autoBeam: boolean;
  playbackEnabled: boolean;
  metronomeEnabled: boolean;
  aiProvider: "anthropic" | "openai";
  theme: "light" | "dark";
  keyboardLayout: "standard" | "custom";
}

const STORAGE_KEY = "notation-settings";

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
    keyboardLayout: "standard",
  };
}

let currentSettings: AppSettings | null = null;
const listeners: Set<(settings: AppSettings) => void> = new Set();

export function getSettings(): AppSettings {
  if (currentSettings) return currentSettings;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      currentSettings = { ...defaultSettings(), ...JSON.parse(stored) };
    } else {
      currentSettings = defaultSettings();
    }
  } catch {
    currentSettings = defaultSettings();
  }

  return currentSettings!;
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  currentSettings = { ...current, ...partial };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
  } catch {
    // localStorage may be unavailable
  }

  for (const listener of listeners) {
    listener(currentSettings);
  }

  return currentSettings;
}

export function resetSettings(): AppSettings {
  currentSettings = defaultSettings();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
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
