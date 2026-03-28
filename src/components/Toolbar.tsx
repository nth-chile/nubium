import { useEditorStore } from "../state";
import type { DurationType, Accidental } from "../model";

const DURATIONS: { type: DurationType; label: string; key: string }[] = [
  { type: "whole", label: "𝅝", key: "1" },
  { type: "half", label: "𝅗𝅥", key: "2" },
  { type: "quarter", label: "♩", key: "3" },
  { type: "eighth", label: "♪", key: "4" },
  { type: "16th", label: "𝅘𝅥𝅯", key: "5" },
  { type: "32nd", label: "𝅘𝅥𝅰", key: "6" },
];

const ACCIDENTALS: { acc: Accidental; label: string }[] = [
  { acc: "flat", label: "♭" },
  { acc: "natural", label: "♮" },
  { acc: "sharp", label: "♯" },
];

interface ToolbarProps {
  onToggleChat?: () => void;
  chatVisible?: boolean;
  onToggleSettings?: () => void;
  onTogglePlugins?: () => void;
}

export function Toolbar({ onToggleChat, chatVisible, onToggleSettings, onTogglePlugins }: ToolbarProps) {
  const inputState = useEditorStore((s) => s.inputState);
  const setDuration = useEditorStore((s) => s.setDuration);
  const toggleDot = useEditorStore((s) => s.toggleDot);
  const setAccidental = useEditorStore((s) => s.setAccidental);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  return (
    <div style={styles.toolbar}>
      <div style={styles.group}>
        <span style={styles.label}>Duration</span>
        {DURATIONS.map((d) => (
          <button
            key={d.type}
            onClick={() => setDuration(d.type)}
            style={{
              ...styles.button,
              ...(inputState.duration.type === d.type ? styles.active : {}),
            }}
            title={`${d.type} (${d.key})`}
          >
            {d.label}
          </button>
        ))}
        <button
          onClick={toggleDot}
          style={{
            ...styles.button,
            ...(inputState.duration.dots > 0 ? styles.active : {}),
          }}
          title="Dot (.)"
        >
          •{inputState.duration.dots > 0 ? inputState.duration.dots : ""}
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.label}>Accidental</span>
        {ACCIDENTALS.map((a) => (
          <button
            key={a.acc}
            onClick={() => setAccidental(a.acc)}
            style={{
              ...styles.button,
              ...(inputState.accidental === a.acc && a.acc !== "natural" ? styles.active : {}),
            }}
            title={a.acc}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.label}>Octave</span>
        <span style={styles.value}>{inputState.octave}</span>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <button onClick={undo} style={styles.button} title="Undo (Ctrl+Z)">
          ↩
        </button>
        <button onClick={redo} style={styles.button} title="Redo (Ctrl+Shift+Z)">
          ↪
        </button>
      </div>

      <div style={{ flex: 1 }} />

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

      {onToggleChat && (
        <button
          onClick={onToggleChat}
          style={{
            ...styles.button,
            ...(chatVisible ? styles.active : {}),
            fontSize: 12,
            padding: "4px 12px",
          }}
          title="Toggle AI Chat (Ctrl+Shift+A)"
        >
          AI Chat
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
  label: {
    fontSize: 11,
    color: "#64748b",
    marginRight: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  value: {
    fontSize: 14,
    fontWeight: 600,
    color: "#1e293b",
    minWidth: 20,
    textAlign: "center" as const,
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
