import { useState, useEffect, useSyncExternalStore } from "react";
import type { PluginManager, PluginEntry, PluginCommand } from "../plugins";

interface PluginPanelProps {
  visible: boolean;
  onClose: () => void;
  pluginManager: PluginManager | null;
}

const CATEGORY_ORDER: Record<string, number> = {
  "Feature": 0,
  "Transform": 1,
};

function categorize(pluginId: string): string {
  // Feature plugins provide UI panels, views, or importers/exporters
  const featureIds = [
    "notation.views",
    "notation.playback",
    "notation.ai-chat",
    "notation.part-manager",
    "notation.musicxml",
  ];
  if (featureIds.includes(pluginId)) return "Feature";
  return "Transform";
}

export function PluginPanel({ visible, onClose, pluginManager }: PluginPanelProps) {
  // Subscribe to plugin manager changes for live updates
  const snapshot = useSyncExternalStore(
    (cb) => pluginManager?.subscribe(cb) ?? (() => {}),
    () => {
      if (!pluginManager) return "";
      return pluginManager
        .getPlugins()
        .map((p) => `${p.plugin.id}:${p.enabled}`)
        .join(",");
    }
  );

  const plugins = pluginManager?.getPlugins() ?? [];

  if (!visible || !pluginManager) return null;

  // Group by category
  const grouped = new Map<string, PluginEntry[]>();
  for (const entry of plugins) {
    const cat = categorize(entry.plugin.id);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(entry);
  }

  const sortedCategories = Array.from(grouped.keys()).sort(
    (a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99)
  );

  function handleToggle(pluginId: string, enabled: boolean) {
    if (!pluginManager) return;
    if (enabled) {
      pluginManager.deactivate(pluginId);
    } else {
      pluginManager.activate(pluginId);
    }
  }

  function handleRunCommand(cmd: PluginCommand) {
    cmd.handler();
  }

  // Suppress unused var
  void snapshot;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Plugins</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            X
          </button>
        </div>

        <div style={styles.body}>
          {plugins.length === 0 && (
            <p style={styles.empty}>No plugins installed.</p>
          )}

          {sortedCategories.map((category) => (
            <div key={category}>
              <div style={styles.categoryHeader}>{category} Plugins</div>
              {grouped.get(category)!.map((entry) => (
                <div key={entry.plugin.id} style={styles.pluginCard}>
                  <div style={styles.pluginHeader}>
                    <div>
                      <div style={styles.pluginName}>{entry.plugin.name}</div>
                      <div style={styles.pluginMeta}>
                        v{entry.plugin.version}
                        {entry.plugin.description &&
                          ` \u2014 ${entry.plugin.description}`}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleToggle(entry.plugin.id, entry.enabled)
                      }
                      style={{
                        ...styles.toggleBtn,
                        ...(entry.enabled
                          ? styles.toggleEnabled
                          : styles.toggleDisabled),
                      }}
                    >
                      {entry.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>

                  {entry.enabled && entry.commands.length > 0 && (
                    <div style={styles.commandList}>
                      {entry.commands.map((cmd) => (
                        <button
                          key={cmd.id}
                          onClick={() => handleRunCommand(cmd)}
                          style={styles.commandBtn}
                        >
                          {cmd.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {entry.enabled && entry.panels.length > 0 && (
                    <div style={styles.registrationList}>
                      {entry.panels.map((p) => (
                        <span key={p.id} style={styles.registrationTag}>
                          Panel: {p.config.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {entry.enabled && entry.views.length > 0 && (
                    <div style={styles.registrationList}>
                      {entry.views.map((v) => (
                        <span key={v.id} style={styles.registrationTag}>
                          View: {v.config.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {entry.enabled &&
                    (entry.importers.length > 0 ||
                      entry.exporters.length > 0) && (
                      <div style={styles.registrationList}>
                        {entry.importers.map((imp) => (
                          <span key={imp.id} style={styles.registrationTag}>
                            Import: {imp.config.name}
                          </span>
                        ))}
                        {entry.exporters.map((exp) => (
                          <span key={exp.id} style={styles.registrationTag}>
                            Export: {exp.config.name}
                          </span>
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  panel: {
    background: "#fff",
    borderRadius: 8,
    width: 560,
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#1e293b",
  },
  closeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    color: "#64748b",
    padding: "4px 8px",
  },
  body: {
    padding: "16px 20px",
    overflowY: "auto" as const,
  },
  empty: {
    color: "#94a3b8",
    textAlign: "center" as const,
    padding: 20,
  },
  categoryHeader: {
    fontSize: 13,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginTop: 12,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: "1px solid #e2e8f0",
  },
  pluginCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  pluginHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pluginName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#1e293b",
  },
  pluginMeta: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  toggleBtn: {
    padding: "4px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
  },
  toggleEnabled: {
    background: "#2563eb",
    color: "#fff",
    borderColor: "#2563eb",
  },
  toggleDisabled: {
    background: "#f1f5f9",
    color: "#64748b",
  },
  commandList: {
    marginTop: 8,
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  commandBtn: {
    padding: "4px 10px",
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    background: "#f8fafc",
    color: "#334155",
  },
  registrationList: {
    marginTop: 6,
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
  },
  registrationTag: {
    fontSize: 10,
    color: "#64748b",
    background: "#f1f5f9",
    padding: "2px 6px",
    borderRadius: 3,
    border: "1px solid #e2e8f0",
  },
};
