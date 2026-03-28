import { useEditorStore } from "../state";
import { useLayoutStore } from "../state/LayoutState";

interface ToolbarProps {
  onToggleSettings?: () => void;
  onTogglePlugins?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
}

export function Toolbar({ onToggleSettings, onTogglePlugins, onOpen, onSave }: ToolbarProps) {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const panels = useLayoutStore((s) => s.panels);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const hasLeftPanels = panels.left.length > 0;
  const hasRightPanels = panels.right.length > 0;

  return (
    <div style={styles.toolbar}>
      <div style={styles.group}>
        <button onClick={undo} style={styles.button} title="Undo (Ctrl+Z)">
          {"\u21A9"}
        </button>
        <button onClick={redo} style={styles.button} title="Redo (Ctrl+Shift+Z)">
          {"\u21AA"}
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        {onOpen && (
          <button onClick={onOpen} style={{ ...styles.button, fontSize: 12, padding: "4px 8px" }} title="Open file">
            Open
          </button>
        )}
        {onSave && (
          <button onClick={onSave} style={{ ...styles.button, fontSize: 12, padding: "4px 8px" }} title="Save file">
            Save
          </button>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {hasLeftPanels && (
        <button
          onClick={() => toggleSidebar("left")}
          style={{
            ...styles.button,
            fontSize: 12,
            padding: "4px 10px",
            ...(sidebarOpen.left ? styles.active : {}),
          }}
          title={sidebarOpen.left ? "Hide left sidebar" : "Show left sidebar"}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="1" y="2" width="12" height="10" rx="1" />
            <line x1="5" y1="2" x2="5" y2="12" />
          </svg>
        </button>
      )}

      {hasRightPanels && (
        <button
          onClick={() => toggleSidebar("right")}
          style={{
            ...styles.button,
            fontSize: 12,
            padding: "4px 10px",
            ...(sidebarOpen.right ? styles.active : {}),
          }}
          title={sidebarOpen.right ? "Hide right sidebar" : "Show right sidebar"}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="1" y="2" width="12" height="10" rx="1" />
            <line x1="9" y1="2" x2="9" y2="12" />
          </svg>
        </button>
      )}

      {onToggleSettings && (
        <button
          onClick={onToggleSettings}
          style={{
            ...styles.button,
            fontSize: 12,
            padding: "4px 12px",
          }}
          title="Settings"
        >
          Settings
        </button>
      )}

      {onTogglePlugins && (
        <button
          onClick={onTogglePlugins}
          style={{
            ...styles.button,
            fontSize: 12,
            padding: "4px 12px",
          }}
          title="Plugins"
        >
          Plugins
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
    flexShrink: 0,
  },
  group: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  button: {
    padding: "4px 8px",
    fontSize: 16,
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    background: "#fff",
    cursor: "pointer",
    minWidth: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  active: {
    background: "#2563eb",
    color: "#fff",
    borderColor: "#2563eb",
  },
  divider: {
    width: 1,
    height: 24,
    background: "#e2e8f0",
    margin: "0 4px",
  },
};
