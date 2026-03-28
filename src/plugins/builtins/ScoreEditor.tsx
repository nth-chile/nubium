import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { useEditorStore } from "../../state";
import type { DurationType, Accidental } from "../../model";

const DURATIONS: { type: DurationType; label: string; key: string }[] = [
  { type: "whole", label: "W", key: "1" },
  { type: "half", label: "H", key: "2" },
  { type: "quarter", label: "Q", key: "3" },
  { type: "eighth", label: "8", key: "4" },
  { type: "16th", label: "16", key: "5" },
  { type: "32nd", label: "32", key: "6" },
];

const ACCIDENTALS: { acc: Accidental; label: string }[] = [
  { acc: "flat", label: "\u266D" },
  { acc: "natural", label: "\u266E" },
  { acc: "sharp", label: "\u266F" },
];

function NoteInputPanel() {
  const inputState = useEditorStore((s) => s.inputState);
  const setDuration = useEditorStore((s) => s.setDuration);
  const toggleDot = useEditorStore((s) => s.toggleDot);
  const setAccidental = useEditorStore((s) => s.setAccidental);

  return (
    <div style={styles.bar}>
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
          {"\u2022"}{inputState.duration.dots > 0 ? inputState.duration.dots : ""}
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f1f5f9",
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

export const ScoreEditorPlugin: NotationPlugin = {
  id: "notation.score-editor",
  name: "Score Editor",
  version: "1.0.0",
  description: "Duration, accidental, octave, and dot note input controls",

  activate(api: PluginAPI) {
    api.registerPanel("score-editor.note-input", {
      title: "Note Input",
      location: "toolbar",
      component: () => <NoteInputPanel />,
      defaultEnabled: true,
    });
  },
};
