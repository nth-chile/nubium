import { useState, useEffect, useRef, useCallback } from "react";
import type { PluginManager, PluginCommand } from "../plugins";
import { getSettings, matchesBinding, SHORTCUT_ACTIONS, getBindingParts } from "../settings";

// Map command IDs to keybinding action IDs where they differ
const COMMAND_TO_ACTION: Record<string, string> = {
  "notation.dynamics": "dynamics-popover",
  "notation.tempo": "tempo-popover",
  "notation.time-signature": "time-sig-popover",
  "notation.key-signature": "key-sig-popover",
  "notation.rehearsal-mark": "rehearsal-popover",
  "notation.barline": "barline-popover",
  "notation.view-full-score": "view:full-score",
  "notation.view-lead-sheet": "view:lead-sheet",
  "notation.view-songwriter": "view:songwriter",
  "notation.view-tab": "view:tab",
  "notation.play": "play-pause",
  "notation.toggle-chat": "toggle-right-sidebar",
};

function getShortcutParts(commandId: string): string[] | null {
  const actionId = COMMAND_TO_ACTION[commandId] ?? commandId.replace("notation.", "");
  const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId);
  if (!action) return null;
  const custom = getSettings().keyBindings[actionId];
  return getBindingParts(custom ?? action.defaultBinding);
}

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
    return cmd.label.toLowerCase().includes(q) || cmd.id.toLowerCase().includes(q);
  });

  const open = useCallback(() => { setVisible(true); setQuery(""); setSelectedIndex(0); }, []);
  const close = useCallback(() => { setVisible(false); setQuery(""); setSelectedIndex(0); }, []);
  const execute = useCallback((cmd: PluginCommand) => { close(); cmd.handler(); }, [close]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const binding = getSettings().keyBindings["command-palette"];
      if (binding && matchesBinding(e, binding)) {
        e.preventDefault();
        visible ? close() : open();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, open, close]);

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 0);
  }, [visible]);

  if (!visible) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") { e.preventDefault(); if (filtered[selectedIndex]) execute(filtered[selectedIndex]); return; }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center pt-24 z-[1100]" onClick={close}>
      <div className="bg-popover border rounded-lg w-[500px] max-h-[400px] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          className="px-4 py-3 text-base border-b bg-background text-foreground outline-none"
        />
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 && (
            <div className="py-5 px-4 text-center text-sm text-muted-foreground">No commands found</div>
          )}
          {filtered.map((cmd, i) => {
            const parts = getShortcutParts(cmd.id);
            return (
              <div
                key={cmd.id}
                onClick={() => execute(cmd)}
                className={`px-4 py-2 cursor-pointer flex justify-between items-center ${i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"}`}
              >
                <span className="text-sm">{cmd.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">{cmd.id}</span>
                  {parts && (
                    <span className="flex items-center gap-0.5">
                      {parts.map((key, ki) => (
                        <kbd key={ki} className="text-xs text-muted-foreground bg-muted min-w-[20px] text-center px-1 py-0.5 rounded border">{key}</kbd>
                      ))}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
