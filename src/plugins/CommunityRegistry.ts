/**
 * Community plugin registry — fetches available plugins from the nubium-plugins
 * GitHub repo, handles install/uninstall, and loads installed plugin bundles.
 */

import type { NubiumPlugin } from "./PluginAPI";

const REGISTRY_URL =
  "https://raw.githubusercontent.com/nth-chile/nubium-plugins/main/index.json";
const PLUGIN_BASE_URL =
  "https://raw.githubusercontent.com/nth-chile/nubium-plugins/main/plugins";

const INSTALLED_KEY = "nubium-community-plugins";
const SAFETY_KEY = "nubium-community-plugins-enabled";

export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  minAppVersion: string;
  main: string;
  permissions: string[];
}

interface RegistryIndex {
  version: number;
  plugins: RegistryEntry[];
}

interface InstalledPlugin {
  manifest: RegistryEntry;
  bundle: string; // the JS source code
}

// --- Safety gate ---

export function isCommunityPluginsEnabled(): boolean {
  try {
    return localStorage.getItem(SAFETY_KEY) === "true";
  } catch {
    return false;
  }
}

export function enableCommunityPlugins(): void {
  try {
    localStorage.setItem(SAFETY_KEY, "true");
  } catch {
    // ignore
  }
}

export function disableCommunityPlugins(): void {
  try {
    localStorage.removeItem(SAFETY_KEY);
  } catch {
    // ignore
  }
}

// --- Registry fetch ---

export async function fetchRegistry(): Promise<RegistryEntry[]> {
  const res = await fetch(REGISTRY_URL);
  if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
  const data: RegistryIndex = await res.json();
  return data.plugins;
}

// --- Install / uninstall ---

function loadInstalledMap(): Map<string, InstalledPlugin> {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    if (raw) {
      const arr: InstalledPlugin[] = JSON.parse(raw);
      return new Map(arr.map((p) => [p.manifest.id, p]));
    }
  } catch {
    // ignore
  }
  return new Map();
}

function saveInstalledMap(map: Map<string, InstalledPlugin>): void {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(Array.from(map.values())));
  } catch {
    // ignore
  }
}

export function getInstalledPlugins(): InstalledPlugin[] {
  return Array.from(loadInstalledMap().values());
}

export function isInstalled(pluginId: string): boolean {
  return loadInstalledMap().has(pluginId);
}

export function getInstalledVersion(pluginId: string): string | undefined {
  return loadInstalledMap().get(pluginId)?.manifest.version;
}

export async function installPlugin(entry: RegistryEntry): Promise<void> {
  const bundleUrl = `${PLUGIN_BASE_URL}/${entry.id}/${entry.main}`;
  const res = await fetch(bundleUrl);
  if (!res.ok) throw new Error(`Failed to fetch plugin bundle: ${res.status}`);
  const bundle = await res.text();

  const map = loadInstalledMap();
  map.set(entry.id, { manifest: entry, bundle });
  saveInstalledMap(map);
}

export function uninstallPlugin(pluginId: string): void {
  const map = loadInstalledMap();
  map.delete(pluginId);
  saveInstalledMap(map);

  // Clean up plugin-scoped storage
  try {
    localStorage.removeItem(`nubium-plugin-data:${pluginId}`);
  } catch {
    // ignore
  }
}

// --- Plugin loading ---

/**
 * Load a community plugin bundle and return a NubiumPlugin instance.
 * The bundle is expected to assign a plugin object to `module.exports` or
 * export a default NubiumPlugin.
 */
export function loadPluginFromBundle(installed: InstalledPlugin): NubiumPlugin {
  const { manifest, bundle } = installed;

  // Create a minimal module/exports environment for the bundle
  const module = { exports: {} as Record<string, unknown> };
  const exports = module.exports;

  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function("module", "exports", bundle);
    factory(module, exports);
  } catch (err) {
    throw new Error(`Failed to load plugin "${manifest.id}": ${err}`);
  }

  // The bundle should export a NubiumPlugin-compatible object
  const plugin =
    (module.exports as { default?: NubiumPlugin }).default ?? module.exports;

  if (!plugin || typeof (plugin as NubiumPlugin).activate !== "function") {
    throw new Error(
      `Plugin "${manifest.id}" does not export a valid NubiumPlugin (missing activate())`
    );
  }

  const loaded = plugin as NubiumPlugin;

  // Override metadata from manifest to ensure consistency
  return {
    ...loaded,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
  };
}

/**
 * Load all installed community plugins. Returns successfully loaded plugins
 * and logs errors for any that fail.
 */
export function loadAllInstalled(): NubiumPlugin[] {
  const installed = getInstalledPlugins();
  const plugins: NubiumPlugin[] = [];

  for (const entry of installed) {
    try {
      plugins.push(loadPluginFromBundle(entry));
    } catch (err) {
      console.error(`[CommunityRegistry] ${err}`);
    }
  }

  return plugins;
}
