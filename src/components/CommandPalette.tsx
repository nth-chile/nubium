import { useState, useEffect, useRef, useCallback } from "react";
import type { PluginManager, PluginCommand } from "../plugins";

interface CommandPaletteProps {
  pluginManager: PluginManager | null;
}

export function CommandPalette({ pluginManager }: CommandPaletteProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = pluginManager?.getCommands() ?? [];

  const filtered = commands.filter((cmd) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q)
    );
  });

  const open = useCallback(() => {
    setVisible(true);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const execute = useCallback(
    (cmd: PluginCommand) => {
      close();
      cmd.handler();
    },
    [close]
  );

  // Ctrl+Shift+P to toggle
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        if (visible) {
          close();
        } else {
          open();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, open, close]);

  // Focus input when visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [visible]);

  if (!visible) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        execute(filtered[selectedIndex]);
      }
      return;
    }
  }

  return (
    <div style={styles.overlay} onClick={close}>
      <div style={styles.palette} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          style={styles.input}
        />

        <div style={styles.list}>
          {filtered.length === 0 && (
            <div style={styles.empty}>No commands found</div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              onClick={() => execute(cmd)}
              style={{
                ...styles.item,
                ...(i === selectedIndex ? styles.itemSelected : {}),
              }}
            >
              <span style={styles.itemLabel}>{cmd.label}</span>
              <span style={styles.itemId}>{cmd.id}</span>
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
    background: "rgba(0,0,0,0.3)",
    display: "flex",
    justifyContent: "center",
    paddingTop: 100,
    zIndex: 1100,
  },
  palette: {
    background: "#fff",
    borderRadius: 8,
    width: 500,
    maxHeight: 400,
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
    overflow: "hidden",
  },
  input: {
    padding: "12px 16px",
    fontSize: 16,
    border: "none",
    borderBottom: "1px solid #e2e8f0",
    outline: "none",
  },
  list: {
    overflowY: "auto" as const,
    flex: 1,
  },
  empty: {
    padding: "20px 16px",
    color: "#94a3b8",
    textAlign: "center" as const,
    fontSize: 14,
  },
  item: {
    padding: "8px 16px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemSelected: {
    background: "#eff6ff",
  },
  itemLabel: {
    fontSize: 14,
    color: "#1e293b",
  },
  itemId: {
    fontSize: 12,
    color: "#94a3b8",
  },
};
