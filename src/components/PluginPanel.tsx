import { useState, useEffect, useSyncExternalStore, useCallback } from "react";
import type { PluginManager, PluginEntry } from "../plugins";
import {
  fetchRegistry,
  installPlugin,
  uninstallPlugin,
  isInstalled,
  getInstalledVersion,
  isCommunityPluginsEnabled,
  enableCommunityPlugins,
  disableCommunityPlugins,
  loadPluginFromBundle,
  type RegistryEntry,
} from "../plugins/CommunityRegistry";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
import { Settings, Download, Trash2, RefreshCw, ArrowUpCircle } from "lucide-react";

interface PluginPanelProps {
  visible: boolean;
  onClose: () => void;
  pluginManager: PluginManager | null;
}

function isCore(pluginId: string): boolean {
  return pluginId.startsWith("nubium.");
}

// --- Installed plugin card ---

function PluginCard({
  entry,
  pluginManager,
  registryEntry,
}: {
  entry: PluginEntry;
  pluginManager: PluginManager;
  registryEntry?: RegistryEntry;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const community = !isCore(entry.plugin.id);
  const hasUpdate = registryEntry && getInstalledVersion(entry.plugin.id) !== registryEntry.version;

  const handleUpdate = async () => {
    if (!registryEntry) return;
    setUpdating(true);
    try {
      pluginManager.deactivate(entry.plugin.id);
      await installPlugin(registryEntry);
      const stored = JSON.parse(localStorage.getItem("nubium-community-plugins") ?? "[]");
      const match = stored.find((p: { manifest: RegistryEntry }) => p.manifest.id === entry.plugin.id);
      if (match) {
        const loaded = loadPluginFromBundle(match);
        pluginManager.registerAndActivate(loaded, true);
      }
    } catch {
      // ignore
    } finally {
      setUpdating(false);
    }
  };

  const handleUninstall = () => {
    pluginManager.deactivate(entry.plugin.id);
    uninstallPlugin(entry.plugin.id);
  };

  const name = registryEntry?.name ?? entry.plugin.name;
  const description = registryEntry?.description ?? entry.plugin.description;
  const version = registryEntry?.version ?? entry.plugin.version;
  const author = registryEntry?.author;

  return (
    <div className="border rounded-md p-3 mb-2 bg-background">
      <div className="flex justify-between items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {name}
            {community && (
              <span className="text-[10px] font-normal text-muted-foreground ml-1.5">v{version}</span>
            )}
          </div>
          {(description || author) && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {author && <span>by {author}</span>}
              {author && description && <span> &middot; </span>}
              {description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {hasUpdate && (
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <ArrowUpCircle className="h-3 w-3" />
              {updating ? "Updating..." : "Update"}
            </button>
          )}
          {community && (
            <button
              onClick={handleUninstall}
              className="p-1 rounded-sm hover:bg-accent cursor-pointer text-muted-foreground hover:text-destructive transition-colors"
              title="Uninstall"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {entry.enabled && entry.settingsComponent && (
            <button
              onClick={() => setSettingsOpen((s) => !s)}
              className="p-1 rounded-sm hover:bg-accent cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
              title="Plugin settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
          <Switch
            checked={entry.enabled}
            onCheckedChange={(checked) => {
              checked ? pluginManager.activate(entry.plugin.id) : pluginManager.deactivate(entry.plugin.id);
              if (!checked) setSettingsOpen(false);
            }}
          />
        </div>
      </div>

      {settingsOpen && entry.settingsComponent && (
        <div className="mt-3 pt-3 border-t">
          {entry.settingsComponent()}
        </div>
      )}
    </div>
  );
}

// --- Community plugin card (browse tab) ---

function CommunityCard({
  entry,
  pluginManager,
  onInstalled,
}: {
  entry: RegistryEntry;
  pluginManager: PluginManager;
  onInstalled: () => void;
}) {
  const installed = isInstalled(entry.id);
  const installedVersion = getInstalledVersion(entry.id);
  const hasUpdate = installed && installedVersion !== entry.version;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setLoading(true);
    setError(null);
    try {
      await installPlugin(entry);
      const stored = JSON.parse(localStorage.getItem("nubium-community-plugins") ?? "[]");
      const match = stored.find((p: { manifest: RegistryEntry }) => p.manifest.id === entry.id);
      if (match) {
        const loaded = loadPluginFromBundle(match);
        pluginManager.registerAndActivate(loaded, true);
      }
      onInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    setError(null);
    try {
      pluginManager.deactivate(entry.id);
      await installPlugin(entry);
      const stored = JSON.parse(localStorage.getItem("nubium-community-plugins") ?? "[]");
      const match = stored.find((p: { manifest: RegistryEntry }) => p.manifest.id === entry.id);
      if (match) {
        const loaded = loadPluginFromBundle(match);
        pluginManager.registerAndActivate(loaded, true);
      }
      onInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-md p-3 mb-2 bg-background">
      <div className="flex justify-between items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{entry.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            by {entry.author} &middot; v{entry.version}
          </div>
          {entry.description && (
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {entry.description}
            </div>
          )}
          {entry.permissions.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {entry.permissions.map((p) => (
                <span key={p} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {hasUpdate ? (
            <button
              onClick={handleUpdate}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <ArrowUpCircle className="h-3 w-3" />
              {loading ? "Updating..." : "Update"}
            </button>
          ) : !installed ? (
            <button
              onClick={handleInstall}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <Download className="h-3 w-3" />
              {loading ? "Installing..." : "Install"}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Installed</span>
          )}
        </div>
      </div>
      {error && <div className="text-xs text-destructive mt-2">{error}</div>}
    </div>
  );
}

// --- Safety gate ---

function SafetyGate({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="py-2 px-2">
      <h3 className="text-sm font-semibold mb-2">Community Plugins</h3>
      <p className="text-xs text-muted-foreground mb-1">
        Community plugins are created by third-party developers.
      </p>
      <p className="text-xs text-muted-foreground mb-1">
        They can access your scores and run code on your device.
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Nubium reviews plugin submissions, but cannot guarantee they are safe.
      </p>
      <button
        onClick={onAccept}
        className="px-4 py-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
      >
        I understand the risks — enable community plugins
      </button>
    </div>
  );
}

// --- Community browser tab ---

function CommunityBrowser({ pluginManager }: { pluginManager: PluginManager }) {
  const [enabled, setEnabled] = useState(isCommunityPluginsEnabled);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    fetchRegistry()
      .then(setRegistry)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load registry"))
      .finally(() => setLoading(false));
  }, [enabled, refreshKey]);

  if (!enabled) {
    return (
      <SafetyGate
        onAccept={() => {
          enableCommunityPlugins();
          setEnabled(true);
        }}
      />
    );
  }

  const filtered = search
    ? registry.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.description.toLowerCase().includes(search.toLowerCase()) ||
          e.author.toLowerCase().includes(search.toLowerCase())
      )
    : registry;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Search community plugins..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-xs px-2 py-1.5 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={refresh}
          disabled={loading}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && <div className="text-xs text-destructive mb-3">{error}</div>}

      {loading && registry.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-5">Loading plugins...</p>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-5">
          {registry.length === 0 ? "No community plugins available yet." : "No results."}
        </p>
      )}

      {filtered.map((entry) => (
        <CommunityCard
          key={entry.id}
          entry={entry}
          pluginManager={pluginManager}
          onInstalled={refresh}
        />
      ))}

      <button
        onClick={() => {
          disableCommunityPlugins();
          setEnabled(false);
        }}
        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer mt-4"
      >
        Disable community plugins
      </button>
    </div>
  );
}

// --- Main panel with tabs ---

type Tab = "installed" | "community";

export function PluginPanel({ visible, onClose, pluginManager }: PluginPanelProps) {
  const [tab, setTab] = useState<Tab>("installed");
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);

  const snapshot = useSyncExternalStore(
    (cb) => pluginManager?.subscribe(cb) ?? (() => {}),
    () => pluginManager?.getPlugins().map((p) => `${p.plugin.id}:${p.enabled}`).join(",") ?? ""
  );

  const plugins = pluginManager?.getPlugins() ?? [];
  void snapshot;

  // Fetch registry for update checks on the installed tab
  useEffect(() => {
    if (!visible || !isCommunityPluginsEnabled()) return;
    fetchRegistry().then(setRegistry).catch(() => {});
  }, [visible]);

  const registryMap = new Map(registry.map((r) => [r.id, r]));

  const corePlugins = plugins.filter((e) => isCore(e.plugin.id));
  const communityPlugins = plugins.filter((e) => !isCore(e.plugin.id));

  return (
    <Dialog open={visible && !!pluginManager} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plugins</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-0 border-b mb-3">
          {(["installed", "community"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                tab === t
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "installed" ? "Installed" : "Browse"}
            </button>
          ))}
        </div>

        {/* Installed tab */}
        {tab === "installed" && (
          <>
            {corePlugins.length > 0 && (
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 pb-1 border-b">
                  Core
                </div>
                {corePlugins.map((entry) => (
                  <PluginCard key={entry.plugin.id} entry={entry} pluginManager={pluginManager!} />
                ))}
              </div>
            )}

            {communityPlugins.length > 0 && (
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-3 mb-2 pb-1 border-b">
                  Community
                </div>
                {communityPlugins.map((entry) => (
                  <PluginCard
                    key={entry.plugin.id}
                    entry={entry}
                    pluginManager={pluginManager!}
                    registryEntry={registryMap.get(entry.plugin.id)}
                  />
                ))}
              </div>
            )}

            {plugins.length === 0 && (
              <p className="text-center text-muted-foreground py-5">No plugins installed.</p>
            )}
          </>
        )}

        {/* Community tab */}
        {tab === "community" && pluginManager && (
          <CommunityBrowser pluginManager={pluginManager} />
        )}
      </DialogContent>
    </Dialog>
  );
}
