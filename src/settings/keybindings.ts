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

export interface ShortcutAction {
  id: string;
  label: string;
  category: string;
  defaultBinding: KeyBinding;
}

/** All available shortcut actions with their default bindings */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // Note input
  { id: "note:a", label: "Insert A", category: "Notes", defaultBinding: { key: "a" } },
  { id: "note:b", label: "Insert B", category: "Notes", defaultBinding: { key: "b" } },
  { id: "note:c", label: "Insert C", category: "Notes", defaultBinding: { key: "c" } },
  { id: "note:d", label: "Insert D", category: "Notes", defaultBinding: { key: "d" } },
  { id: "note:e", label: "Insert E", category: "Notes", defaultBinding: { key: "e" } },
  { id: "note:f", label: "Insert F", category: "Notes", defaultBinding: { key: "f" } },
  { id: "note:g", label: "Insert G", category: "Notes", defaultBinding: { key: "g" } },
  { id: "insert-rest", label: "Insert rest", category: "Notes", defaultBinding: { key: "r" } },
  { id: "delete", label: "Delete note", category: "Notes", defaultBinding: { key: "backspace" } },

  // Duration
  { id: "duration:whole", label: "Whole note", category: "Duration", defaultBinding: { key: "1" } },
  { id: "duration:half", label: "Half note", category: "Duration", defaultBinding: { key: "2" } },
  { id: "duration:quarter", label: "Quarter note", category: "Duration", defaultBinding: { key: "3" } },
  { id: "duration:eighth", label: "Eighth note", category: "Duration", defaultBinding: { key: "4" } },
  { id: "duration:16th", label: "16th note", category: "Duration", defaultBinding: { key: "5" } },
  { id: "duration:32nd", label: "32nd note", category: "Duration", defaultBinding: { key: "6" } },
  { id: "duration:64th", label: "64th note", category: "Duration", defaultBinding: { key: "7" } },
  { id: "toggle-dot", label: "Toggle dot", category: "Duration", defaultBinding: { key: "." } },
  { id: "toggle-step-entry", label: "Step entry mode", category: "Notes", defaultBinding: { key: "n" } },

  // Accidentals
  { id: "accidental:sharp", label: "Sharp", category: "Accidentals", defaultBinding: { key: "=" } },
  { id: "accidental:flat", label: "Flat", category: "Accidentals", defaultBinding: { key: "-" } },

  // Navigation
  { id: "cursor:left", label: "Move cursor left", category: "Navigation", defaultBinding: { key: "arrowleft" } },
  { id: "cursor:right", label: "Move cursor right", category: "Navigation", defaultBinding: { key: "arrowright" } },
  { id: "octave:up", label: "Octave up", category: "Navigation", defaultBinding: { key: "arrowup" } },
  { id: "octave:down", label: "Octave down", category: "Navigation", defaultBinding: { key: "arrowdown" } },
  { id: "part:up", label: "Previous part", category: "Navigation", defaultBinding: { key: "arrowup", alt: true } },
  { id: "part:down", label: "Next part", category: "Navigation", defaultBinding: { key: "arrowdown", alt: true } },

  // Selection
  { id: "select:left", label: "Extend selection left", category: "Selection", defaultBinding: { key: "arrowleft", shift: true } },
  { id: "select:right", label: "Extend selection right", category: "Selection", defaultBinding: { key: "arrowright", shift: true } },
  { id: "escape", label: "Clear selection", category: "Selection", defaultBinding: { key: "escape" } },
  { id: "copy", label: "Copy", category: "Selection", defaultBinding: { key: "c", ctrl: true } },
  { id: "paste", label: "Paste", category: "Selection", defaultBinding: { key: "v", ctrl: true } },
  { id: "cut", label: "Cut", category: "Selection", defaultBinding: { key: "x", ctrl: true } },

  // Editing
  { id: "undo", label: "Undo", category: "Editing", defaultBinding: { key: "z", ctrl: true } },
  { id: "redo", label: "Redo", category: "Editing", defaultBinding: { key: "z", ctrl: true, shift: true } },
  { id: "insert-measure", label: "Insert measure", category: "Editing", defaultBinding: { key: "m", ctrl: true } },
  { id: "delete-measure", label: "Delete measure", category: "Editing", defaultBinding: { key: "backspace", ctrl: true, shift: true } },

  // Voices
  { id: "voice:1", label: "Voice 1", category: "Voices", defaultBinding: { key: "1", ctrl: true } },
  { id: "voice:2", label: "Voice 2", category: "Voices", defaultBinding: { key: "2", ctrl: true } },
  { id: "voice:3", label: "Voice 3", category: "Voices", defaultBinding: { key: "3", ctrl: true } },
  { id: "voice:4", label: "Voice 4", category: "Voices", defaultBinding: { key: "4", ctrl: true } },

  // Views
  { id: "view:songwriter", label: "Songwriter view", category: "Views", defaultBinding: { key: "1", ctrl: true, shift: true } },
  { id: "view:lead-sheet", label: "Lead Sheet view", category: "Views", defaultBinding: { key: "2", ctrl: true, shift: true } },
  { id: "view:tab", label: "Tab view", category: "Views", defaultBinding: { key: "3", ctrl: true, shift: true } },
  { id: "view:full-score", label: "Full Score view", category: "Views", defaultBinding: { key: "4", ctrl: true, shift: true } },

  // Annotation
  { id: "chord-mode", label: "Chord input", category: "Annotation", defaultBinding: { key: "c", shift: true } },
  { id: "lyric-mode", label: "Lyric input", category: "Annotation", defaultBinding: { key: "l", shift: true } },
  { id: "dynamics-popover", label: "Dynamics", category: "Annotation", defaultBinding: { key: "d", shift: true } },

  // Articulations
  { id: "articulation:accent", label: "Accent", category: "Articulations", defaultBinding: { key: ">", shift: true } },
  { id: "articulation:staccato", label: "Staccato", category: "Articulations", defaultBinding: { key: "<", shift: true } },
  { id: "articulation:tenuto", label: "Tenuto", category: "Articulations", defaultBinding: { key: "t", shift: true } },
  { id: "articulation:fermata", label: "Fermata", category: "Articulations", defaultBinding: { key: "u", shift: true } },
  { id: "articulation:marcato", label: "Marcato", category: "Articulations", defaultBinding: { key: "^", shift: true } },

  // Playback
  { id: "play-pause", label: "Play / Pause", category: "Playback", defaultBinding: { key: " " } },
  { id: "stop-playback", label: "Stop playback", category: "Playback", defaultBinding: { key: ".", ctrl: true } },
  { id: "toggle-metronome", label: "Toggle metronome", category: "Playback", defaultBinding: { key: "m", shift: true } },

  // File
  { id: "file:open", label: "Open file", category: "File", defaultBinding: { key: "o", ctrl: true } },
  { id: "file:save", label: "Save file", category: "File", defaultBinding: { key: "s", ctrl: true } },

  // UI
  { id: "toggle-settings", label: "Settings", category: "UI", defaultBinding: { key: ",", ctrl: true } },
  { id: "toggle-left-sidebar", label: "Toggle left sidebar", category: "UI", defaultBinding: { key: "b", ctrl: true } },
  { id: "toggle-right-sidebar", label: "Toggle right sidebar", category: "UI", defaultBinding: { key: "b", ctrl: true, shift: true } },
  { id: "command-palette", label: "Command palette", category: "UI", defaultBinding: { key: "p", ctrl: true, shift: true } },
  { id: "toggle-plugins", label: "Toggle plugins", category: "UI", defaultBinding: { key: "e", ctrl: true, shift: true } },
  { id: "file-history", label: "File history", category: "File", defaultBinding: { key: "h", ctrl: true, shift: true } },
];

/** Build default bindings map from action definitions */
export function defaultKeyBindings(): Record<string, KeyBinding> {
  const map: Record<string, KeyBinding> = {};
  for (const action of SHORTCUT_ACTIONS) {
    map[action.id] = { ...action.defaultBinding };
  }
  return map;
}

/** Format a keybinding for display */
export function formatBinding(binding: KeyBinding): string {
  const isMac = navigator.platform?.includes("Mac") ?? false;
  const parts: string[] = [];
  if (binding.ctrl) parts.push(isMac ? "\u2318" : "Ctrl");
  if (binding.alt) parts.push(isMac ? "\u2325" : "Alt");
  if (binding.shift) parts.push(isMac ? "\u21E7" : "Shift");

  // Friendly key names
  const keyNames: Record<string, string> = {
    " ": "Space",
    arrowleft: "\u2190",
    arrowright: "\u2192",
    arrowup: "\u2191",
    arrowdown: "\u2193",
    backspace: "\u232B",
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

/** Check if a keyboard event matches a binding. ctrl maps to metaKey on Mac. */
export function matchesBinding(e: KeyboardEvent, binding: KeyBinding): boolean {
  const key = e.key.toLowerCase();
  // For shifted keys like > < ^, compare against e.key directly
  if (binding.key === ">" || binding.key === "<" || binding.key === "^") {
    if (e.key !== binding.key) return false;
  } else if (key !== binding.key) {
    return false;
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
