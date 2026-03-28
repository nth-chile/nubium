import { useEditorStore } from "../state";

export function StatusBar() {
  const inputState = useEditorStore((s) => s.inputState);
  const filePath = useEditorStore((s) => s.filePath);
  const isDirty = useEditorStore((s) => s.isDirty);
  const score = useEditorStore((s) => s.score);
  const autoSaveStatus = useEditorStore((s) => s.autoSaveStatus);
  const importSource = useEditorStore((s) => s.importSource);

  const { cursor } = inputState;

  return (
    <div style={styles.bar}>
      <span style={styles.item}>
        {score.title}{isDirty ? " *" : ""}
      </span>
      <span style={styles.item}>
        Measure {cursor.measureIndex + 1} | Beat pos {cursor.eventIndex + 1}
      </span>
      <span style={styles.item}>
        {inputState.duration.type}{inputState.duration.dots > 0 ? "." : ""}
      </span>
      <span style={styles.item}>
        Oct {inputState.octave}
      </span>
      <span style={styles.item}>
        Voice {inputState.voice + 1}
      </span>
      <span style={styles.item}>
        {inputState.accidental !== "natural" ? inputState.accidental : ""}
      </span>
      {importSource && (
        <span style={styles.item}>
          Imported: {importSource.split("/").pop()}
        </span>
      )}
      {autoSaveStatus && (
        <span style={styles.item}>
          {autoSaveStatus}
        </span>
      )}
      <span style={{ ...styles.item, marginLeft: "auto" }}>
        {filePath ? filePath.split("/").pop() : "unsaved"}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "4px 16px",
    borderTop: "1px solid #e2e8f0",
    background: "#1e293b",
    color: "#94a3b8",
    fontSize: 12,
    flexShrink: 0,
  },
  item: {
    whiteSpace: "nowrap" as const,
  },
};
