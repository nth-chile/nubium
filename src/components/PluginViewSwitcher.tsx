import { useEditorStore } from "../state";
import type { ViewEntry } from "../plugins";
import type { ViewModeType } from "../views/ViewMode";

interface PluginViewSwitcherProps {
  views: ViewEntry[];
}

export function PluginViewSwitcher({ views }: PluginViewSwitcherProps) {
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);

  return (
    <div style={styles.container}>
      {views.map((view) => {
        // Derive view mode type from the config
        const config = view.config.getViewConfig();
        const type = config.type;
        return (
          <button
            key={view.id}
            onClick={() => setViewMode(type as ViewModeType)}
            style={{
              ...styles.button,
              ...(viewMode === type ? styles.activeButton : {}),
            }}
            title={view.config.name}
          >
            <span style={styles.icon}>{view.config.icon}</span>
            <span style={styles.label}>{view.config.name}</span>
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    gap: "2px",
    padding: "4px 12px",
    background: "#f0f0f0",
    borderBottom: "1px solid #ddd",
    alignItems: "center",
  },
  button: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    border: "1px solid transparent",
    borderRadius: "4px",
    background: "transparent",
    cursor: "pointer",
    fontSize: "12px",
    color: "#555",
    transition: "all 0.15s",
  },
  activeButton: {
    background: "#fff",
    border: "1px solid #ccc",
    color: "#000",
    fontWeight: "bold" as const,
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  },
  icon: {
    fontSize: "14px",
  },
  label: {
    fontSize: "12px",
  },
};
