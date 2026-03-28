import { useState } from "react";
import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { useEditorStore } from "../../state";
import { INSTRUMENTS } from "../../model/instruments";

function PartsPanel() {
  const score = useEditorStore((s) => s.score);
  const cursorPartIndex = useEditorStore(
    (s) => s.inputState.cursor.partIndex
  );
  const addPart = useEditorStore((s) => s.addPart);
  const removePart = useEditorStore((s) => s.removePart);
  const reorderPart = useEditorStore((s) => s.reorderPart);
  const toggleSolo = useEditorStore((s) => s.toggleSolo);
  const toggleMute = useEditorStore((s) => s.toggleMute);
  const moveCursorToPart = useEditorStore((s) => s.moveCursorToPart);

  const [selectedInstrument, setSelectedInstrument] = useState("piano");
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <div style={styles.collapsedPanel}>
        <button
          onClick={() => setIsCollapsed(false)}
          style={styles.expandButton}
          title="Show Parts"
        >
          Parts
        </button>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Parts</span>
        <button
          onClick={() => setIsCollapsed(true)}
          style={styles.collapseButton}
          title="Hide"
        >
          &times;
        </button>
      </div>

      <div style={styles.partList}>
        {score.parts.map((part, index) => (
          <div
            key={part.id}
            style={{
              ...styles.partItem,
              ...(index === cursorPartIndex ? styles.partItemActive : {}),
            }}
            onClick={() => moveCursorToPart(index)}
          >
            <div style={styles.partInfo}>
              <span style={styles.partName}>{part.name}</span>
              <span style={styles.partAbbr}>({part.abbreviation})</span>
            </div>
            <div style={styles.partControls}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSolo(index);
                }}
                style={{
                  ...styles.toggleButton,
                  ...(part.solo ? styles.soloActive : {}),
                }}
                title="Solo"
              >
                S
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute(index);
                }}
                style={{
                  ...styles.toggleButton,
                  ...(part.muted ? styles.muteActive : {}),
                }}
                title="Mute"
              >
                M
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  reorderPart(index, "up");
                }}
                disabled={index === 0}
                style={styles.reorderButton}
                title="Move Up"
              >
                &uarr;
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  reorderPart(index, "down");
                }}
                disabled={index === score.parts.length - 1}
                style={styles.reorderButton}
                title="Move Down"
              >
                &darr;
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removePart(index);
                }}
                disabled={score.parts.length <= 1}
                style={styles.removeButton}
                title="Remove Part"
              >
                &times;
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.addSection}>
        <select
          value={selectedInstrument}
          onChange={(e) => setSelectedInstrument(e.target.value)}
          style={styles.instrumentSelect}
        >
          {INSTRUMENTS.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => addPart(selectedInstrument)}
          style={styles.addButton}
        >
          Add Part
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 200,
    minWidth: 200,
    borderRight: "1px solid #ddd",
    backgroundColor: "#f8f8f8",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  collapsedPanel: {
    width: 40,
    minWidth: 40,
    borderRight: "1px solid #ddd",
    backgroundColor: "#f8f8f8",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 8,
  },
  expandButton: {
    writingMode: "vertical-rl" as const,
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 11,
    color: "#555",
    padding: "4px 2px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 8px",
    borderBottom: "1px solid #ddd",
  },
  title: {
    fontWeight: 600,
    fontSize: 12,
  },
  collapseButton: {
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 14,
    color: "#999",
    padding: "0 2px",
  },
  partList: {
    flex: 1,
    overflowY: "auto" as const,
  },
  partItem: {
    padding: "6px 8px",
    borderBottom: "1px solid #eee",
    cursor: "pointer",
    fontSize: 11,
  },
  partItemActive: {
    backgroundColor: "#e3ecff",
  },
  partInfo: {
    display: "flex",
    gap: 4,
    alignItems: "baseline",
    marginBottom: 4,
  },
  partName: {
    fontWeight: 600,
    fontSize: 11,
  },
  partAbbr: {
    fontSize: 10,
    color: "#888",
  },
  partControls: {
    display: "flex",
    gap: 2,
  },
  toggleButton: {
    width: 22,
    height: 20,
    border: "1px solid #ccc",
    borderRadius: 2,
    fontSize: 9,
    fontWeight: 700,
    cursor: "pointer",
    backgroundColor: "#fff",
    color: "#666",
    padding: 0,
  },
  soloActive: {
    backgroundColor: "#facc15",
    borderColor: "#ca8a04",
    color: "#000",
  },
  muteActive: {
    backgroundColor: "#ef4444",
    borderColor: "#dc2626",
    color: "#fff",
  },
  reorderButton: {
    width: 22,
    height: 20,
    border: "1px solid #ccc",
    borderRadius: 2,
    fontSize: 10,
    cursor: "pointer",
    backgroundColor: "#fff",
    color: "#666",
    padding: 0,
  },
  removeButton: {
    width: 22,
    height: 20,
    border: "1px solid #ccc",
    borderRadius: 2,
    fontSize: 12,
    cursor: "pointer",
    backgroundColor: "#fff",
    color: "#999",
    padding: 0,
  },
  addSection: {
    padding: "6px 8px",
    borderTop: "1px solid #ddd",
    display: "flex",
    gap: 4,
  },
  instrumentSelect: {
    flex: 1,
    fontSize: 10,
    padding: "2px 4px",
    border: "1px solid #ccc",
    borderRadius: 2,
  },
  addButton: {
    fontSize: 10,
    padding: "2px 8px",
    border: "1px solid #ccc",
    borderRadius: 2,
    cursor: "pointer",
    backgroundColor: "#fff",
  },
};

export const PartManagerPlugin: NotationPlugin = {
  id: "notation.part-manager",
  name: "Part Manager",
  version: "1.0.0",
  description: "Manage parts: add, remove, reorder, solo, mute",

  activate(api: PluginAPI) {
    api.registerPanel("parts.panel", {
      title: "Parts",
      location: "sidebar-left",
      component: () => <PartsPanel />,
      defaultEnabled: true,
    });

    api.registerCommand("notation.add-part", "Add Part", () => {
      useEditorStore.getState().addPart("piano");
    });
  },
};
