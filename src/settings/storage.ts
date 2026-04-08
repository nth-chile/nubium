/**
 * Dual-storage helper: localStorage (sync, always available) + Tauri config file (async, durable).
 * Browser-only users get localStorage. Tauri users get both, with config file taking priority.
 */

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

const SIMULATE_FRESH_INSTALL = import.meta.env.VITE_CLEAN_SETTINGS === "1";

/**
 * Read a JSON value from dual storage.
 * Returns localStorage value synchronously, then resolves config file async.
 */
export function readDualStorage<T>(
  localStorageKey: string,
  configFileName: string,
  defaults: T,
  onConfigLoaded?: (value: T) => void,
): T {
  // Sync: read from localStorage
  let value = defaults;
  if (!SIMULATE_FRESH_INSTALL) {
    try {
      const stored = localStorage.getItem(localStorageKey);
      if (stored) value = { ...defaults, ...JSON.parse(stored) };
    } catch { /* ignore */ }
  }

  // Async: try Tauri config file (takes priority)
  if (!SIMULATE_FRESH_INSTALL) {
    readConfigJson<T>(configFileName).then((fileValue) => {
      if (fileValue) {
        const merged = { ...defaults, ...fileValue };
        // Sync localStorage with config file
        try { localStorage.setItem(localStorageKey, JSON.stringify(merged)); } catch { /* ignore */ }
        onConfigLoaded?.(merged);
      } else if (value !== defaults) {
        // No config file yet — write current value to create one
        writeConfigJson(configFileName, value);
      }
    });
  }

  return value;
}

/**
 * Write a JSON value to both localStorage and Tauri config file.
 */
export function writeDualStorage<T>(localStorageKey: string, configFileName: string, value: T): void {
  try { localStorage.setItem(localStorageKey, JSON.stringify(value)); } catch { /* ignore */ }
  writeConfigJson(configFileName, value);
}

async function readConfigJson<T>(fileName: string): Promise<T | null> {
  const tauri = await getTauriFsModules();
  if (!tauri) return null;
  try {
    const configDir = await tauri.path.appConfigDir();
    const content = await tauri.fs.readTextFile(`${configDir}${fileName}`);
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeConfigJson<T>(fileName: string, value: T): Promise<void> {
  const tauri = await getTauriFsModules();
  if (!tauri) return;
  try {
    const configDir = await tauri.path.appConfigDir();
    await tauri.fs.mkdir(configDir, { recursive: true });
    await tauri.fs.writeTextFile(`${configDir}${fileName}`, JSON.stringify(value, null, 2));
  } catch { /* ignore */ }
}
