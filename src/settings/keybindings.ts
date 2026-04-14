/**
 * Keybinding system — defines all keyboard shortcuts with editable bindings.
 * Inspired by Obsidian's hotkey system.
 */

export interface KeyBinding {
  key: string; // lowercase key name (e.g. "a", "arrowleft", " ")
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export type ShortcutMode = "normal" | "note-entry" | "both";

export interface ShortcutAction {
  id: string;
  label: string;
  category: string;
  defaultBinding: KeyBinding;
  /** Which editor mode(s) this action is active in. Defaults to "both". */
  mode?: ShortcutMode;
}

/** All available shortcut actions with their default bindings */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // Note input (note entry mode only)
  { id: "note:a", label: "Insert A", category: "Notes", defaultBinding: { key: "a" }, mode: "note-entry" },
  { id: "note:b", label: "Insert B", category: "Notes", defaultBinding: { key: "b" }, mode: "note-entry" },
  { id: "note:c", label: "Insert C", category: "Notes", defaultBinding: { key: "c" }, mode: "note-entry" },
  { id: "note:d", label: "Insert D", category: "Notes", defaultBinding: { key: "d" }, mode: "note-entry" },
  { id: "note:e", label: "Insert E", category: "Notes", defaultBinding: { key: "e" }, mode: "note-entry" },
  { id: "note:f", label: "Insert F", category: "Notes", defaultBinding: { key: "f" }, mode: "note-entry" },
  { id: "note:g", label: "Insert G", category: "Notes", defaultBinding: { key: "g" }, mode: "note-entry" },
  { id: "insert-rest", label: "Insert rest", category: "Notes", defaultBinding: { key: "r" }, mode: "note-entry" },
  { id: "delete", label: "Delete note", category: "Notes", defaultBinding: { key: "backspace" } },

  // Duration (note entry sets pending; normal changes selection)
  { id: "duration:whole", label: "Whole note", category: "Duration", defaultBinding: { key: "1" }, mode: "note-entry" },
  { id: "duration:half", label: "Half note", category: "Duration", defaultBinding: { key: "2" }, mode: "note-entry" },
  { id: "duration:quarter", label: "Quarter note", category: "Duration", defaultBinding: { key: "3" }, mode: "note-entry" },
  { id: "duration:eighth", label: "Eighth note", category: "Duration", defaultBinding: { key: "4" }, mode: "note-entry" },
  { id: "duration:16th", label: "16th note", category: "Duration", defaultBinding: { key: "5" }, mode: "note-entry" },
  { id: "duration:32nd", label: "32nd note", category: "Duration", defaultBinding: { key: "6" }, mode: "note-entry" },
  { id: "duration:64th", label: "64th note", category: "Duration", defaultBinding: { key: "7" }, mode: "note-entry" },
  { id: "toggle-dot", label: "Toggle dot", category: "Duration", defaultBinding: { key: "." }, mode: "note-entry" },

  // Mode toggles
  { id: "toggle-note-entry", label: "Note entry mode", category: "Modes", defaultBinding: { key: "n" } },
  { id: "toggle-insert-mode", label: "Insert sub-mode", category: "Modes", defaultBinding: { key: "i" }, mode: "note-entry" },
  { id: "toggle-pitch-before-duration", label: "Pitch before duration", category: "Modes", defaultBinding: { key: "k" }, mode: "note-entry" },
  { id: "toggle-grace-note", label: "Grace note mode", category: "Modes", defaultBinding: { key: "g", shift: true }, mode: "note-entry" },

  // Transforms (work in both modes)
  { id: "toggle-slur", label: "Slur", category: "Transforms", defaultBinding: { key: "s" }, mode: "normal" },
  { id: "toggle-tie", label: "Tie", category: "Transforms", defaultBinding: { key: "t" } },
  { id: "toggle-mute", label: "Mute (suppress playback)", category: "Transforms", defaultBinding: { key: "m", shift: true }, mode: "normal" },
  { id: "hairpin:crescendo", label: "Crescendo", category: "Annotation", defaultBinding: { key: ",", shift: true, alt: true } },
  { id: "hairpin:diminuendo", label: "Diminuendo", category: "Annotation", defaultBinding: { key: ".", shift: true, alt: true } },

  // Accidentals (note entry sets pending; normal applies to selection)
  { id: "accidental:sharp", label: "Sharp", category: "Accidentals", defaultBinding: { key: "=" } },
  { id: "accidental:flat", label: "Flat", category: "Accidentals", defaultBinding: { key: "-" } },

  // Navigation
  { id: "cursor:left", label: "Move cursor left", category: "Navigation", defaultBinding: { key: "arrowleft" } },
  { id: "cursor:right", label: "Move cursor right", category: "Navigation", defaultBinding: { key: "arrowright" } },
  { id: "pitch:up", label: "Pitch up (diatonic)", category: "Navigation", defaultBinding: { key: "arrowup", alt: true } },
  { id: "pitch:down", label: "Pitch down (diatonic)", category: "Navigation", defaultBinding: { key: "arrowdown", alt: true } },
  { id: "pitch-chromatic:up", label: "Pitch up (chromatic)", category: "Navigation", defaultBinding: { key: "arrowup", alt: true, shift: true } },
  { id: "pitch-chromatic:down", label: "Pitch down (chromatic)", category: "Navigation", defaultBinding: { key: "arrowdown", alt: true, shift: true } },
  { id: "octave:up", label: "Octave up", category: "Navigation", defaultBinding: { key: "arrowup", alt: true, ctrl: true } },
  { id: "octave:down", label: "Octave down", category: "Navigation", defaultBinding: { key: "arrowdown", alt: true, ctrl: true } },
  { id: "part:up", label: "Previous part", category: "Navigation", defaultBinding: { key: "arrowup" } },
  { id: "part:down", label: "Next part", category: "Navigation", defaultBinding: { key: "arrowdown" } },
  { id: "measure:prev", label: "Previous measure", category: "Navigation", defaultBinding: { key: "arrowleft", ctrl: true } },
  { id: "measure:next", label: "Next measure", category: "Navigation", defaultBinding: { key: "arrowright", ctrl: true } },
  { id: "measure:prev-alt", label: "Previous measure (alt)", category: "Navigation", defaultBinding: { key: ";" } },
  { id: "measure:next-alt", label: "Next measure (alt)", category: "Navigation", defaultBinding: { key: "'" } },
  { id: "nav:beginning", label: "Go to beginning", category: "Navigation", defaultBinding: { key: "enter" } },

  // Selection
  { id: "select:left", label: "Extend selection left", category: "Selection", defaultBinding: { key: "arrowleft", shift: true } },
  { id: "select:right", label: "Extend selection right", category: "Selection", defaultBinding: { key: "arrowright", shift: true } },
  { id: "select-note:left", label: "Extend note selection left", category: "Selection", defaultBinding: { key: "arrowleft", shift: true, alt: true } },
  { id: "select-note:right", label: "Extend note selection right", category: "Selection", defaultBinding: { key: "arrowright", shift: true, alt: true } },
  { id: "select:all", label: "Select all", category: "Selection", defaultBinding: { key: "a", ctrl: true } },
  { id: "escape", label: "Clear selection", category: "Selection", defaultBinding: { key: "escape" } },
  { id: "copy", label: "Copy", category: "Selection", defaultBinding: { key: "c", ctrl: true } },
  { id: "paste", label: "Paste", category: "Selection", defaultBinding: { key: "v", ctrl: true } },
  { id: "cut", label: "Cut", category: "Selection", defaultBinding: { key: "x", ctrl: true } },

  // Editing
  { id: "undo", label: "Undo", category: "Editing", defaultBinding: { key: "z", ctrl: true } },
  { id: "redo", label: "Redo", category: "Editing", defaultBinding: { key: "z", ctrl: true, shift: true } },
  { id: "insert-measure", label: "Insert measure", category: "Editing", defaultBinding: { key: "m", ctrl: true } },
  { id: "delete-measure", label: "Delete measure", category: "Editing", defaultBinding: { key: "backspace", ctrl: true } },

  // Voices
  { id: "voice:1", label: "Voice 1", category: "Voices", defaultBinding: { key: "1", ctrl: true } },
  { id: "voice:2", label: "Voice 2", category: "Voices", defaultBinding: { key: "2", ctrl: true } },
  { id: "voice:3", label: "Voice 3", category: "Voices", defaultBinding: { key: "3", ctrl: true } },
  { id: "voice:4", label: "Voice 4", category: "Voices", defaultBinding: { key: "4", ctrl: true } },

  // Notation toggles
  { id: "toggle:standard", label: "Toggle standard notation", category: "Views", defaultBinding: { key: "1", ctrl: true, shift: true } },
  { id: "toggle:tab", label: "Toggle tab notation", category: "Views", defaultBinding: { key: "2", ctrl: true, shift: true } },
  { id: "toggle:slash", label: "Toggle slash notation", category: "Views", defaultBinding: { key: "3", ctrl: true, shift: true } },

  // Annotation (normal mode bare letters; Shift/Ctrl variants work in both)
  { id: "chord-mode", label: "Chord input", category: "Annotation", defaultBinding: { key: "c" }, mode: "normal" },
  { id: "lyric-mode", label: "Lyric input", category: "Annotation", defaultBinding: { key: "l" }, mode: "normal" },
  { id: "dynamics-popover", label: "Dynamics", category: "Annotation", defaultBinding: { key: "d" }, mode: "normal" },
  { id: "tempo-popover", label: "Tempo marking", category: "Annotation", defaultBinding: { key: "t", ctrl: true, shift: true } },
  { id: "time-sig-popover", label: "Time signature", category: "Annotation", defaultBinding: { key: "t", ctrl: true } },
  { id: "key-sig-popover", label: "Key signature", category: "Annotation", defaultBinding: { key: "k", ctrl: true } },
  { id: "rehearsal-popover", label: "Rehearsal mark", category: "Annotation", defaultBinding: { key: "r" }, mode: "normal" },
  { id: "barline-popover", label: "Barline", category: "Annotation", defaultBinding: { key: "b" }, mode: "normal" },
  { id: "navigation-popover", label: "Navigation marks", category: "Annotation", defaultBinding: { key: "n", shift: true } },

  // Transforms + chord nav
  { id: "toggle-cross-staff", label: "Toggle cross-staff", category: "Notes", defaultBinding: { key: "x" }, mode: "normal" },
  { id: "chord:next-head", label: "Next chord head", category: "Notes", defaultBinding: { key: "]" } },
  { id: "chord:prev-head", label: "Previous chord head", category: "Notes", defaultBinding: { key: "[" } },

  // Articulations
  { id: "articulation:accent", label: "Accent", category: "Articulations", defaultBinding: { key: ">", shift: true } },
  { id: "articulation:staccato", label: "Staccato", category: "Articulations", defaultBinding: { key: "<", shift: true } },
  { id: "articulation:tenuto", label: "Tenuto", category: "Articulations", defaultBinding: { key: "_", shift: true } },
  { id: "articulation:fermata", label: "Fermata", category: "Articulations", defaultBinding: { key: "u" }, mode: "normal" },
  { id: "articulation:marcato", label: "Marcato", category: "Articulations", defaultBinding: { key: "^", shift: true } },
  { id: "articulation:trill", label: "Trill", category: "Articulations", defaultBinding: { key: "r", shift: true, alt: true } },

  // Playback
  { id: "play-pause", label: "Play / Pause", category: "Playback", defaultBinding: { key: " " } },
  { id: "stop-playback", label: "Stop playback", category: "Playback", defaultBinding: { key: ".", ctrl: true } },
  { id: "toggle-metronome", label: "Toggle metronome", category: "Playback", defaultBinding: { key: "m" }, mode: "normal" },
  { id: "toggle-count-in", label: "Toggle count-in", category: "Playback", defaultBinding: { key: "i", shift: true } },

  // File
  { id: "file:new", label: "New score", category: "File", defaultBinding: { key: "n", ctrl: true } },
  { id: "file:open", label: "Open file", category: "File", defaultBinding: { key: "o", ctrl: true } },
  { id: "file:save", label: "Save file", category: "File", defaultBinding: { key: "s", ctrl: true } },

  // UI
  { id: "toggle-settings", label: "Settings", category: "UI", defaultBinding: { key: ",", ctrl: true } },
  { id: "toggle-left-sidebar", label: "Toggle left sidebar", category: "UI", defaultBinding: { key: "b", ctrl: true } },
  { id: "toggle-right-sidebar", label: "Toggle right sidebar", category: "UI", defaultBinding: { key: "b", ctrl: true, shift: true } },
  { id: "command-palette", label: "Command palette", category: "UI", defaultBinding: { key: "p", ctrl: true, shift: true } },
  { id: "toggle-plugins", label: "Toggle plugins", category: "UI", defaultBinding: { key: "e", ctrl: true, shift: true } },
  { id: "file-history", label: "File history", category: "File", defaultBinding: { key: "h", ctrl: true, shift: true } },
  { id: "go-to-measure", label: "Go to measure", category: "Navigation", defaultBinding: { key: "g", ctrl: true } },

  // Zoom (score-only)
  { id: "zoom:in", label: "Zoom in", category: "View", defaultBinding: { key: "=", ctrl: true } },
  { id: "zoom:out", label: "Zoom out", category: "View", defaultBinding: { key: "-", ctrl: true } },
  { id: "zoom:reset", label: "Reset zoom", category: "View", defaultBinding: { key: "0", ctrl: true } },
];

/** Build default bindings map from action definitions */
export function defaultKeyBindings(): Record<string, KeyBinding> {
  const map: Record<string, KeyBinding> = {};
  for (const action of SHORTCUT_ACTIONS) {
    map[action.id] = { ...action.defaultBinding };
  }
  return map;
}

/** Pre-v2 default bindings, used to auto-upgrade users who never customized
 *  a shortcut. If their stored binding matches the old default, we rewrite
 *  it to the new default; otherwise we preserve their override. */
const LEGACY_DEFAULT_BINDINGS: Record<string, KeyBinding> = {
  "chord-mode": { key: "c", shift: true },
  "lyric-mode": { key: "l", shift: true },
  "dynamics-popover": { key: "d", shift: true },
  "rehearsal-popover": { key: "r", shift: true },
  "barline-popover": { key: "b", shift: true },
  "toggle-cross-staff": { key: "x", shift: true },
  "toggle-metronome": { key: "m", shift: true },
  "toggle-slur": { key: "s", shift: true },
  "articulation:fermata": { key: "u", shift: true },
  "articulation:tenuto": { key: "t", shift: true },
};

function bindingsEqual(a: KeyBinding, b: KeyBinding): boolean {
  return a.key === b.key && !!a.ctrl === !!b.ctrl && !!a.shift === !!b.shift && !!a.alt === !!b.alt;
}

/** Migrate a stored keyBindings record from any older schema to the current one. */
export function migrateKeyBindings(stored: Record<string, KeyBinding>): Record<string, KeyBinding> {
  const out: Record<string, KeyBinding> = { ...stored };

  // Rename toggle-step-entry → toggle-note-entry, preserving any user override.
  if (out["toggle-step-entry"]) {
    if (!out["toggle-note-entry"]) {
      out["toggle-note-entry"] = out["toggle-step-entry"];
    }
    delete out["toggle-step-entry"];
  }

  // For each action that got a new default, replace the stored binding if it
  // still matches the old default (i.e. user never customized it).
  for (const [actionId, legacy] of Object.entries(LEGACY_DEFAULT_BINDINGS)) {
    const current = out[actionId];
    if (current && bindingsEqual(current, legacy)) {
      const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId);
      if (action) out[actionId] = { ...action.defaultBinding };
    }
  }

  return out;
}

/** Look up an action's mode filter. Defaults to "both" if unspecified. */
export function actionMode(actionId: string): ShortcutMode {
  return SHORTCUT_ACTIONS.find((a) => a.id === actionId)?.mode ?? "both";
}

/** Check if an action should fire in the current editor mode. */
export function actionActiveInMode(actionId: string, noteEntry: boolean): boolean {
  const mode = actionMode(actionId);
  if (mode === "both") return true;
  return mode === (noteEntry ? "note-entry" : "normal");
}

/** Format a keybinding for display */
export function formatBinding(binding: KeyBinding): string {
  const isMac = navigator.platform?.includes("Mac") ?? false;
  const parts: string[] = [];
  if (binding.ctrl) parts.push(isMac ? "⌘" : "Ctrl");
  if (binding.alt) parts.push(isMac ? "⌥" : "Alt");
  if (binding.shift) parts.push(isMac ? "⇧" : "Shift");

  // Friendly key names
  const keyNames: Record<string, string> = {
    " ": "Space",
    arrowleft: "←",
    arrowright: "→",
    arrowup: "↑",
    arrowdown: "↓",
    backspace: "⌫",
    escape: "Esc",
    ">": ">",
    "<": "<",
    "^": "^",
    "=": "=",
    "-": "-",
    ".": ".",
  };

  const keyDisplay = keyNames[binding.key] ?? binding.key.toUpperCase();
  parts.push(keyDisplay);
  return parts.join(isMac ? "" : "+");
}

/** Return individual key parts for rendering each as a separate element */
export function getBindingParts(binding: KeyBinding): string[] {
  const isMac = navigator.platform?.includes("Mac") ?? false;
  const parts: string[] = [];
  if (binding.ctrl) parts.push(isMac ? "⌘" : "Ctrl");
  if (binding.alt) parts.push(isMac ? "⌥" : "Alt");
  if (binding.shift) parts.push(isMac ? "⇧" : "Shift");

  const keyNames: Record<string, string> = {
    " ": "Space", arrowleft: "←", arrowright: "→", arrowup: "↑",
    arrowdown: "↓", backspace: "⌫", escape: "Esc",
    ">": ">", "<": "<", "^": "^", "=": "=", "-": "-", ".": ".",
  };
  parts.push(keyNames[binding.key] ?? binding.key.toUpperCase());
  return parts;
}

/** Map e.code → unshifted key name so modifier combos still match (e.g. Shift+2 → "2", Alt+R → "r") */
const CODE_TO_KEY: Record<string, string> = {
  Digit0: "0", Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4",
  Digit5: "5", Digit6: "6", Digit7: "7", Digit8: "8", Digit9: "9",
  KeyA: "a", KeyB: "b", KeyC: "c", KeyD: "d", KeyE: "e", KeyF: "f",
  KeyG: "g", KeyH: "h", KeyI: "i", KeyJ: "j", KeyK: "k", KeyL: "l",
  KeyM: "m", KeyN: "n", KeyO: "o", KeyP: "p", KeyQ: "q", KeyR: "r",
  KeyS: "s", KeyT: "t", KeyU: "u", KeyV: "v", KeyW: "w", KeyX: "x",
  KeyY: "y", KeyZ: "z",
};

/** Check if a keyboard event matches a binding. ctrl maps to metaKey on Mac. */
export function matchesBinding(e: KeyboardEvent, binding: KeyBinding): boolean {
  const key = e.key.toLowerCase();
  // For shifted keys like > < ^, compare against e.key directly
  if (binding.key === ">" || binding.key === "<" || binding.key === "^") {
    if (e.key !== binding.key) return false;
  } else if (key !== binding.key) {
    // Shift changes e.key for digits (e.g., Shift+2 → "@"), so fall back to e.code
    const codeKey = CODE_TO_KEY[e.code];
    if (!codeKey || codeKey !== binding.key) return false;
  }

  const wantCtrl = binding.ctrl ?? false;
  const wantShift = binding.shift ?? false;
  const wantAlt = binding.alt ?? false;

  const hasCtrl = e.ctrlKey || e.metaKey;
  const hasShift = e.shiftKey;
  const hasAlt = e.altKey;

  return hasCtrl === wantCtrl && hasShift === wantShift && hasAlt === wantAlt;
}

/** Get the formatted display string for an action's current binding */
export function getBindingLabel(actionId: string, customBindings?: Record<string, KeyBinding>): string {
  const custom = customBindings?.[actionId];
  if (custom) return formatBinding(custom);
  const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId);
  if (action) return formatBinding(action.defaultBinding);
  return "";
}

/** Parse a keyboard event into a KeyBinding */
export function eventToBinding(e: KeyboardEvent): KeyBinding | null {
  const key = e.key.toLowerCase();
  // Ignore bare modifier keys
  if (["control", "shift", "alt", "meta"].includes(key)) return null;

  const binding: KeyBinding = { key };
  if (e.ctrlKey || e.metaKey) binding.ctrl = true;
  if (e.shiftKey) binding.shift = true;
  if (e.altKey) binding.alt = true;
  return binding;
}
