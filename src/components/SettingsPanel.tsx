import { useState, useEffect, useCallback, useRef } from "react";
import { getSettings, updateSettings, subscribeSettings, type AppSettings, type DisplaySettings, SHORTCUT_ACTIONS, formatBinding, eventToBinding, defaultKeyBindings, type KeyBinding } from "../settings";
import type { ClefType } from "../model";
import { useEditorStore } from "../state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
}

type SettingsTab = "settings" | "hotkeys" | "feedback";

export function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [tab, setTab] = useState<SettingsTab>("settings");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    const unsub = subscribeSettings((s) => setSettings({ ...s }));
    return unsub;
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSettings({ [key]: value });
  }

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${tab === "hotkeys" ? "max-w-lg" : "max-w-md"} max-h-[80vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <div className="flex gap-1 border-b border-border pb-2">
            <button
              onClick={() => setTab("settings")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === "settings"
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => setTab("hotkeys")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === "hotkeys"
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hotkeys
            </button>
            <button
              onClick={() => { setTab("feedback"); setFeedbackSent(false); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === "feedback"
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Feedback
            </button>
          </div>
        </DialogHeader>

        {tab === "hotkeys" ? (
          <HotkeysTab settings={settings} />
        ) : tab === "feedback" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bug report, feature request, or just venting — all welcome.
            </p>
            {feedbackSent ? (
              <div className="text-sm text-green-500 py-4 text-center">
                Thanks for the feedback!
              </div>
            ) : (
              <>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={5}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
                <Button
                  disabled={!feedbackText.trim()}
                  className="w-full"
                  onClick={async () => {
                    try {
                      const res = await fetch("https://formspree.io/f/xgopavpe", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ message: feedbackText }),
                      });
                      if (res.ok) {
                        setFeedbackText("");
                        setFeedbackSent(true);
                      }
                    } catch {
                      // Fallback to mailto if fetch fails
                      const subject = encodeURIComponent("Nubium Feedback");
                      const body = encodeURIComponent(feedbackText);
                      window.open(`mailto:feedback@nubium.app?subject=${subject}&body=${body}`, "_blank");
                      setFeedbackText("");
                      setFeedbackSent(true);
                    }
                  }}
                >
                  Send Feedback
                </Button>
              </>
            )}
          </div>
        ) : (

        <div className="space-y-6">
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">General</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Default Tempo</span>
                <Input
                  type="number"
                  min={20}
                  max={300}
                  value={settings.defaultTempo}
                  onChange={(e) => update("defaultTempo", parseInt(e.target.value) || 120)}
                  className="w-20 h-7"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Time Signature</span>
                <div className="flex gap-1 items-center">
                  <Input
                    type="number"
                    min={1}
                    max={16}
                    value={settings.defaultTimeSignature.numerator}
                    onChange={(e) =>
                      update("defaultTimeSignature", {
                        ...settings.defaultTimeSignature,
                        numerator: parseInt(e.target.value) || 4,
                      })
                    }
                    className="w-12 h-7"
                  />
                  <span className="text-muted-foreground">/</span>
                  <select
                    value={settings.defaultTimeSignature.denominator}
                    onChange={(e) =>
                      update("defaultTimeSignature", {
                        ...settings.defaultTimeSignature,
                        denominator: parseInt(e.target.value),
                      })
                    }
                    className="h-7 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                    <option value={8}>8</option>
                    <option value={16}>16</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Default Clef</span>
                <select
                  value={settings.defaultClef}
                  onChange={(e) => update("defaultClef", e.target.value as ClefType)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="treble">Treble</option>
                  <option value="bass">Bass</option>
                  <option value="alto">Alto</option>
                  <option value="tenor">Tenor</option>
                </select>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Auto Beam</span>
                <input
                  type="checkbox"
                  checked={settings.autoBeam}
                  onChange={(e) => update("autoBeam", e.target.checked)}
                  className="accent-primary"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Pitch before duration</span>
                <input
                  type="checkbox"
                  checked={settings.pitchBeforeDuration}
                  onChange={(e) => {
                    update("pitchBeforeDuration", e.target.checked);
                    useEditorStore.setState((s) => ({
                      inputState: { ...s.inputState, pitchBeforeDuration: e.target.checked, pendingPitch: null },
                    }));
                  }}
                  className="accent-primary"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Display</h3>
            <div className="space-y-3">
              {([
                ["showLyrics", "Lyrics"],
                ["showChordSymbols", "Chord Symbols"],
                ["showRehearsalMarks", "Rehearsal Marks"],
                ["showTempoMarks", "Tempo Marks"],
                ["showDynamics", "Dynamics"],
              ] as [keyof DisplaySettings, string][]).map(([key, label]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-sm">{label}</span>
                  <input
                    type="checkbox"
                    checked={settings.display[key]}
                    onChange={(e) => update("display", { ...settings.display, [key]: e.target.checked })}
                    className="accent-primary"
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">History</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Max Snapshots</span>
                <Input
                  type="number"
                  min={5}
                  max={200}
                  value={settings.historyMaxSnapshots}
                  onChange={(e) => update("historyMaxSnapshots", parseInt(e.target.value) || 50)}
                  className="w-20 h-7"
                />
              </div>
            </div>
          </section>

        </div>

        )}
      </DialogContent>
    </Dialog>
  );
}

function HotkeysTab({ settings }: { settings: AppSettings }) {
  const [search, setSearch] = useState("");
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const bindings = settings.keyBindings ?? defaultKeyBindings();

  const handleCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!editingAction) return;
      e.preventDefault();
      e.stopPropagation();

      const binding = eventToBinding(e);
      if (!binding) return; // bare modifier, ignore

      const updated = { ...bindings, [editingAction]: binding };
      updateSettings({ keyBindings: updated });
      setEditingAction(null);
    },
    [editingAction, bindings],
  );

  useEffect(() => {
    if (!editingAction) return;
    window.addEventListener("keydown", handleCapture, true);
    return () => window.removeEventListener("keydown", handleCapture, true);
  }, [editingAction, handleCapture]);

  // Close capture on click outside
  useEffect(() => {
    if (!editingAction) return;
    const handleClick = (e: MouseEvent) => {
      if (captureRef.current && !captureRef.current.contains(e.target as Node)) {
        setEditingAction(null);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [editingAction]);

  const filteredActions = SHORTCUT_ACTIONS.filter(
    (a) =>
      a.label.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase()),
  );

  const categories = [...new Set(filteredActions.map((a) => a.category))];

  function resetBinding(actionId: string) {
    const defaults = defaultKeyBindings();
    const updated = { ...bindings, [actionId]: defaults[actionId] };
    updateSettings({ keyBindings: updated });
  }

  function isCustom(actionId: string): boolean {
    const defaults = defaultKeyBindings();
    const current = bindings[actionId];
    const def = defaults[actionId];
    if (!current || !def) return false;
    return (
      current.key !== def.key ||
      !!current.ctrl !== !!def.ctrl ||
      !!current.shift !== !!def.shift ||
      !!current.alt !== !!def.alt
    );
  }

  return (
    <div className="space-y-3" ref={captureRef}>
      <Input
        placeholder="Filter hotkeys..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8"
      />
      <div className="space-y-4">
        {categories.map((category) => (
          <section key={category}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {category}
            </h3>
            <div className="space-y-1">
              {filteredActions
                .filter((a) => a.category === category)
                .map((action) => {
                  const binding = bindings[action.id];
                  const editing = editingAction === action.id;
                  const custom = isCustom(action.id);

                  return (
                    <div
                      key={action.id}
                      className="flex items-center justify-between py-1 px-2 rounded hover:bg-secondary/50 group"
                    >
                      <span className="text-sm">{action.label}</span>
                      <div className="flex items-center gap-1">
                        {custom && (
                          <button
                            onClick={() => resetBinding(action.id)}
                            className="text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity px-1"
                            title="Reset to default"
                          >
                            reset
                          </button>
                        )}
                        <button
                          onClick={() => setEditingAction(editing ? null : action.id)}
                          className={`text-xs font-mono px-2 py-0.5 rounded border min-w-15 text-center transition-colors ${
                            editing
                              ? "border-primary bg-primary/10 text-primary animate-pulse"
                              : custom
                                ? "border-primary/50 bg-primary/5 text-foreground hover:border-primary"
                                : "border-input bg-background text-foreground hover:border-primary"
                          }`}
                        >
                          {editing ? "Press key..." : binding ? formatBinding(binding) : "—"}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
      <div className="pt-2 border-t border-border">
        <button
          onClick={() => updateSettings({ keyBindings: defaultKeyBindings() })}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Restore all defaults
        </button>
      </div>
    </div>
  );
}
