import { useState, useEffect, useCallback, useRef } from "react";
import { getSettings, updateSettings, subscribeSettings, type AppSettings, type DisplaySettings, SHORTCUT_ACTIONS, formatBinding, eventToBinding, defaultKeyBindings } from "../settings";
import { useEditorStore } from "../state";
import { useLayoutStore } from "../state/LayoutState";
import { getLicenseState, activateLicense, deactivateLicense } from "../licensing";
import { openExternal } from "../utils/openExternal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

const TOOLBAR_GROUPS = [
  { id: "score-editor.modes", label: "Modes" },
  { id: "score-editor.duration", label: "Duration" },
  { id: "score-editor.accidentals", label: "Accidentals" },
  { id: "playback.transport", label: "Playback" },
];

const NOTATION_TOGGLE_SETTINGS: [keyof DisplaySettings, string][] = [
  ["showStandardToggle", "Standard"],
  ["showTabToggle", "Tab"],
  ["showSlashToggle", "Slash"],
];

function ToolbarSettings() {
  const toolbarHidden = useLayoutStore((s) => s.toolbarHidden);
  const toggleToolbarGroup = useLayoutStore((s) => s.toggleToolbarGroup);
  const [settings, setSettings] = useState(getSettings());
  useEffect(() => subscribeSettings(setSettings), []);

  return (
    <div className="space-y-2">
      {TOOLBAR_GROUPS.map(({ id, label }) => (
        <div key={id}>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!toolbarHidden.includes(id)}
              onChange={() => toggleToolbarGroup(id)}
              className="accent-primary"
            />
            {label}
          </label>
        </div>
      ))}
      <div className="pt-2 border-t mt-2">
        <span className="text-sm font-medium">Notation Toggles (Parts Panel)</span>
        <div className="ml-2 mt-1 space-y-1">
          {NOTATION_TOGGLE_SETTINGS.map(([key, btnLabel]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={settings.display[key]}
                onChange={(e) => updateSettings({ display: { ...settings.display, [key]: e.target.checked } })}
                className="accent-primary"
              />
              {btnLabel}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
}

type SettingsTab = "settings" | "hotkeys" | "license" | "feedback";

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
          <DialogDescription className="sr-only">
            Configure application settings, hotkeys, license, and send feedback.
          </DialogDescription>
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
              onClick={() => setTab("license")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === "license"
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              License
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
        ) : tab === "license" ? (
          <LicenseTab />
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
              <label className="flex items-center gap-2 text-sm cursor-pointer">
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
                Start in pitch-before-duration mode
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.startInInsertMode}
                  onChange={(e) => {
                    update("startInInsertMode", e.target.checked);
                    useEditorStore.setState((s) => ({
                      inputState: { ...s.inputState, insertMode: e.target.checked },
                    }));
                  }}
                  className="accent-primary"
                />
                Note entry: default to insert mode
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.followPlaybackCursor}
                  onChange={(e) => update("followPlaybackCursor", e.target.checked)}
                  className="accent-primary"
                />
                Auto-scroll score during playback
              </label>
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
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.display[key]}
                    onChange={(e) => update("display", { ...settings.display, [key]: e.target.checked })}
                    className="accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Toolbar</h3>
            <ToolbarSettings />
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

const PURCHASE_URL = "https://shipyardnyc.lemonsqueezy.com/checkout/buy/9d811640-4a8e-492c-a61a-53e0093e4782?logo=0&discount=0";
const RECOVER_URL = "https://app.lemonsqueezy.com/my-orders";

function LicenseTab() {
  const [licenseState, setLicenseState] = useState(getLicenseState());
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState(false);

  const [loading, setLoading] = useState(false);

  async function handleActivate() {
    setLoading(true);
    const valid = await activateLicense(keyInput);
    setLoading(false);
    if (valid) {
      setKeyInput("");
      setError(false);
      setLicenseState({ ...getLicenseState() });
    } else {
      setError(true);
    }
  }

  function handleDeactivate() {
    deactivateLicense();
    setLicenseState({ ...getLicenseState() });
  }

  return (
    <div className="space-y-4">
      {licenseState.isValid ? (
        <>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm">Licensed</span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {licenseState.licenseKey?.slice(0, 8)}...{licenseState.licenseKey?.slice(-8)}
          </p>
          <Button variant="outline" size="sm" onClick={handleDeactivate}>
            Deactivate License
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Nubium is free to use. Purchasing a license supports continued development.
          </p>
          <Button onClick={() => openExternal(PURCHASE_URL)} className="w-full">
            Purchase License
          </Button>
          <div className="space-y-2">
            <Input
              placeholder="Paste license key"
              value={keyInput}
              onChange={(e) => { setKeyInput(e.target.value); setError(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleActivate()}
            />
            {error && <p className="text-xs text-destructive">Invalid license key.</p>}
            <Button variant="outline" onClick={handleActivate} disabled={!keyInput.trim() || loading} className="w-full">
              Activate
            </Button>
          </div>
          <button
            onClick={() => openExternal(RECOVER_URL)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors block"
          >
            Lost your license key?
          </button>
        </>
      )}
    </div>
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
