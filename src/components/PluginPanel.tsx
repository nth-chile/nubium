import { useState, useEffect } from "react";
import type { PluginManager, PluginEntry, PluginCommand } from "../plugins";

interface PluginPanelProps {
  visible: boolean;
  onClose: () => void;
  pluginManager: PluginManager | null;
}

export function PluginPanel({ visible, onClose, pluginManager }: PluginPanelProps) {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [, setTick] = useState(0); // force re-render

  useEffect(() => {
    if (pluginManager) {
      setPlugins(pluginManager.getPlugins());
    }
  }, [pluginManager, visible]);

  if (!visible || !pluginManager) return null;

  function handleToggle(pluginId: string, enabled: boolean) {
    if (!pluginManager) return;
    if (enabled) {
      pluginManager.deactivate(pluginId);
    } else {
      pluginManager.activate(pluginId);
    }
    setPlugins(pluginManager.getPlugins());
    setTick((t) => t + 1);
  }

  function handleRunCommand(cmd: PluginCommand) {
    cmd.handler();
  }

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

          {plugins.map((entry) => (
            <div key={entry.plugin.id} style={styles.pluginCard}>
              <div style={styles.pluginHeader}>
                <div>
                  <div style={styles.pluginName}>{entry.plugin.name}</div>
                  <div style={styles.pluginMeta}>
                    v{entry.plugin.version}
                    {entry.plugin.description && ` - ${entry.plugin.description}`}
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(entry.plugin.id, entry.enabled)}
                  style={{
                    ...styles.toggleBtn,
                    ...(entry.enabled ? styles.toggleEnabled : styles.toggleDisabled),
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
    width: 500,
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
};
