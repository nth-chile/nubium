import { useState, useSyncExternalStore } from "react";
import type { PluginManager, PluginEntry } from "../plugins";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
import { Settings } from "lucide-react";

interface PluginPanelProps {
  visible: boolean;
  onClose: () => void;
  pluginManager: PluginManager | null;
}

const CATEGORY_ORDER: Record<string, number> = { Feature: 0, Transform: 1 };

function categorize(pluginId: string): string {
  const featureIds = ["nubium.views", "nubium.builtin-instruments", "nubium.ai-chat", "nubium.export"];
  return featureIds.includes(pluginId) ? "Feature" : "Transform";
}

function PluginCard({ entry, pluginManager }: { entry: PluginEntry; pluginManager: PluginManager }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="border rounded-md p-3 mb-2 bg-background">
      <div className="flex justify-between items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{entry.plugin.name}</div>
          {entry.plugin.description && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {entry.plugin.description}
            </div>
          )}
        </div>
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

      {settingsOpen && entry.settingsComponent && (
        <div className="mt-3 pt-3 border-t">
          {entry.settingsComponent()}
        </div>
      )}
    </div>
  );
}

export function PluginPanel({ visible, onClose, pluginManager }: PluginPanelProps) {
  const snapshot = useSyncExternalStore(
    (cb) => pluginManager?.subscribe(cb) ?? (() => {}),
    () => pluginManager?.getPlugins().map((p) => `${p.plugin.id}:${p.enabled}`).join(",") ?? ""
  );

  const plugins = pluginManager?.getPlugins() ?? [];
  void snapshot;

  const grouped = new Map<string, PluginEntry[]>();
  for (const entry of plugins) {
    const cat = categorize(entry.plugin.id);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(entry);
  }

  const sortedCategories = Array.from(grouped.keys()).sort(
    (a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99)
  );

  return (
    <Dialog open={visible && !!pluginManager} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plugins</DialogTitle>
        </DialogHeader>

        {plugins.length === 0 && (
          <p className="text-center text-muted-foreground py-5">No plugins installed.</p>
        )}

        {sortedCategories.map((category) => (
          <div key={category}>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-3 mb-2 pb-1 border-b">
              {category} Plugins
            </div>
            {grouped.get(category)!.map((entry) => (
              <PluginCard key={entry.plugin.id} entry={entry} pluginManager={pluginManager!} />
            ))}
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
