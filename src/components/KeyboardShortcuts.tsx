import { useEffect } from "react";
import { useEditorStore } from "../state";
import type { PitchClass, DurationType } from "../model";
import { getEffectiveInputMode } from "../views/ViewMode";
import { partStandardStaveCount } from "../renderer/SystemLayout";
import { getSettings, matchesBinding } from "../settings";
import { actionActiveInMode } from "../settings/keybindings";
import { getGlobalPluginManager } from "../plugins/PluginManager";

/** Whether the cursor is currently on a tab stave, accounting for viewConfig. */
function isCursorOnTabStave(): boolean {
  const st = useEditorStore.getState();
  const c = st.inputState.cursor;
  const viewConfig = st.viewConfig;
  const standardCount = partStandardStaveCount(st.score, c.partIndex, viewConfig);
  return getEffectiveInputMode(
    viewConfig,
    c.partIndex,
    st.inputState.tabInputActive,
    c.staveIndex,
    standardCount,
  ) === "tab";
}

// Flash event bus — toolbar buttons subscribe to this
const flashListeners = new Set<(actionId: string) => void>();
export function onFlash(cb: (actionId: string) => void) {
  flashListeners.add(cb);
  return () => { flashListeners.delete(cb); };
}
export function emitFlash(actionId: string) {
  for (const cb of flashListeners) cb(actionId);
}

export function KeyboardShortcuts() {
  const insertNote = useEditorStore((s) => s.insertNote);
  const addPitchToChord = useEditorStore((s) => s.addPitchToChord);
  const cycleChordHead = useEditorStore((s) => s.cycleChordHead);
  const insertRest = useEditorStore((s) => s.insertRest);
  const deleteNote = useEditorStore((s) => s.deleteNote);
  const setDuration = useEditorStore((s) => s.setDuration);
  const toggleDot = useEditorStore((s) => s.toggleDot);
  const setAccidental = useEditorStore((s) => s.setAccidental);
  const moveCursor = useEditorStore((s) => s.moveCursor);
  const changeOctave = useEditorStore((s) => s.changeOctave);
  const nudgePitch = useEditorStore((s) => s.nudgePitch);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setVoice = useEditorStore((s) => s.setVoice);
  const insertMeasure = useEditorStore((s) => s.insertMeasure);
  const deleteMeasure = useEditorStore((s) => s.deleteMeasure);
  const enterChordMode = useEditorStore((s) => s.enterChordMode);
  const enterLyricMode = useEditorStore((s) => s.enterLyricMode);
  const textInputMode = useEditorStore((s) => s.inputState.textInputMode);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const play = useEditorStore((s) => s.play);
  const pause = useEditorStore((s) => s.pause);
  const stopPlayback = useEditorStore((s) => s.stopPlayback);
  const toggleMetronome = useEditorStore((s) => s.toggleMetronome);
  const toggleCountIn = useEditorStore((s) => s.toggleCountIn);
  const moveCursorPart = useEditorStore((s) => s.moveCursorPart);
  const moveCursorToMeasure = useEditorStore((s) => s.moveCursorToMeasure);
  const toggleNotation = useEditorStore((s) => s.toggleNotation);
  const toggleArticulation = useEditorStore((s) => s.toggleArticulation);
  const toggleNoteEntry = useEditorStore((s) => s.toggleNoteEntry);
  const toggleInsertMode = useEditorStore((s) => s.toggleInsertMode);
  const togglePitchBeforeDuration = useEditorStore((s) => s.togglePitchBeforeDuration);
  const toggleGraceNoteMode = useEditorStore((s) => s.toggleGraceNoteMode);
  const toggleSlur = useEditorStore((s) => s.toggleSlur);
  const toggleTie = useEditorStore((s) => s.toggleTie);
  const toggleMute = useEditorStore((s) => s.toggleMute);
  const setHairpin = useEditorStore((s) => s.setHairpin);
  const toggleCrossStaff = useEditorStore((s) => s.toggleCrossStaff);
  const popover = useEditorStore((s) => s.popover);
  const setPopover = useEditorStore((s) => s.setPopover);
  const selection = useEditorStore((s) => s.selection);
  const noteSelection = useEditorStore((s) => s.noteSelection);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setNoteSelection = useEditorStore((s) => s.setNoteSelection);
  const extendNoteSelection = useEditorStore((s) => s.extendNoteSelection);
  const deleteNoteSelection = useEditorStore((s) => s.deleteNoteSelection);
  const extendSelection = useEditorStore((s) => s.extendSelection);
  const deleteSelectedMeasures = useEditorStore((s) => s.deleteSelectedMeasures);
  const clearSelectedMeasures = useEditorStore((s) => s.clearSelectedMeasures);
  const copySelection = useEditorStore((s) => s.copySelection);
  const pasteAtCursor = useEditorStore((s) => s.pasteAtCursor);

  const viewConfig = useEditorStore((s) => s.viewConfig);
  const insertTabNote = useEditorStore((s) => s.insertTabNote);

  useEffect(() => {
    // Action handlers — keyed by shortcut action id
    const handlers: Record<string, () => void> = {
      // Notes
      "note:a": () => insertNote("A" as PitchClass),
      "note:b": () => insertNote("B" as PitchClass),
      "note:c": () => insertNote("C" as PitchClass),
      "note:d": () => insertNote("D" as PitchClass),
      "note:e": () => insertNote("E" as PitchClass),
      "note:f": () => insertNote("F" as PitchClass),
      "note:g": () => insertNote("G" as PitchClass),
      "insert-rest": () => insertRest(),
      "delete": () => {
        if (noteSelection) deleteNoteSelection();
        else if (selection) clearSelectedMeasures();
        else deleteNote();
      },

      // Duration
      "duration:whole": () => setDuration("whole" as DurationType),
      "duration:half": () => setDuration("half" as DurationType),
      "duration:quarter": () => setDuration("quarter" as DurationType),
      "duration:eighth": () => setDuration("eighth" as DurationType),
      "duration:16th": () => setDuration("16th" as DurationType),
      "duration:32nd": () => setDuration("32nd" as DurationType),
      "duration:64th": () => setDuration("64th" as DurationType),
      "toggle-dot": () => toggleDot(),
      "toggle-note-entry": () => toggleNoteEntry(),
      "toggle-insert-mode": () => toggleInsertMode(),
      "toggle-pitch-before-duration": () => togglePitchBeforeDuration(),
      "toggle-grace-note": () => toggleGraceNoteMode(),
      "toggle-slur": () => toggleSlur(),
      "toggle-tie": () => toggleTie(),
      "toggle-mute": () => toggleMute(),
      "hairpin:crescendo": () => setHairpin("crescendo"),
      "hairpin:diminuendo": () => setHairpin("diminuendo"),
      "toggle-cross-staff": () => toggleCrossStaff(),
      "chord:next-head": () => cycleChordHead("next"),
      "chord:prev-head": () => cycleChordHead("prev"),
      "go-to-measure": () => getGlobalPluginManager()?.executeCommand("nubium.go-to-measure"),

      // Accidentals
      "accidental:sharp": () => setAccidental("sharp"),
      "accidental:flat": () => setAccidental("flat"),

      // Navigation
      "cursor:left": () => { if (selection) setSelection(null); if (noteSelection) setNoteSelection(null); moveCursor("left"); },
      "cursor:right": () => { if (selection) setSelection(null); if (noteSelection) setNoteSelection(null); moveCursor("right"); },
      "pitch:up": () => nudgePitch("up", "diatonic"),
      "pitch:down": () => nudgePitch("down", "diatonic"),
      "pitch-chromatic:up": () => nudgePitch("up", "chromatic"),
      "pitch-chromatic:down": () => nudgePitch("down", "chromatic"),
      "octave:up": () => changeOctave("up"),
      "octave:down": () => changeOctave("down"),
      "part:up": () => moveCursorPart("up"),
      "part:down": () => moveCursorPart("down"),
      "measure:prev": () => moveCursorToMeasure("prev"),
      "measure:next": () => moveCursorToMeasure("next"),
      "measure:prev-alt": () => moveCursorToMeasure("prev"),
      "measure:next-alt": () => moveCursorToMeasure("next"),
      "nav:beginning": () => useEditorStore.getState().setCursorDirect({ partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 }),

      // Selection
      "select:left": () => extendSelection("left"),
      "select:right": () => extendSelection("right"),
      "select-note:left": () => extendNoteSelection("left"),
      "select-note:right": () => extendNoteSelection("right"),
      "select:all": () => {
        const s = useEditorStore.getState();
        const part = s.score.parts[s.inputState.cursor.partIndex];
        if (part) {
          setSelection({
            partIndex: s.inputState.cursor.partIndex,
            measureStart: 0,
            measureEnd: part.measures.length - 1,
            measureAnchor: s.inputState.cursor.measureIndex,
          });
        }
      },
      "escape": () => {
        const st = useEditorStore.getState();
        if (st.inputState.noteEntry) {
          // Exit note entry; keep selection state as-is.
          toggleNoteEntry();
          return;
        }
        setSelection(null);
        setNoteSelection(null);
        useEditorStore.setState((s) => ({ inputState: { ...s.inputState, pendingPitch: null } }));
      },
      "copy": () => { if (selection || noteSelection) copySelection(); },
      "paste": () => { pasteAtCursor(); },
      "cut": () => { if (selection) { copySelection(); deleteSelectedMeasures(); } else if (noteSelection) { copySelection(); deleteNoteSelection(); } },

      // Editing
      "undo": () => undo(),
      "redo": () => redo(),
      "insert-measure": () => insertMeasure(),
      "delete-measure": () => deleteMeasure(),

      // Voices
      "voice:1": () => setVoice(0),
      "voice:2": () => setVoice(1),
      "voice:3": () => setVoice(2),
      "voice:4": () => setVoice(3),

      // Notation toggles
      "toggle:standard": () => toggleNotation("standard"),
      "toggle:tab": () => toggleNotation("tab"),
      "toggle:slash": () => toggleNotation("slash"),

      // Annotation
      "chord-mode": () => enterChordMode(),
      "lyric-mode": () => { enterLyricMode(); },
      "dynamics-popover": () => setPopover(popover === "dynamics" ? null : "dynamics"),
      "tempo-popover": () => setPopover(popover === "tempo" ? null : "tempo"),
      "time-sig-popover": () => setPopover(popover === "time-sig" ? null : "time-sig"),
      "key-sig-popover": () => setPopover(popover === "key-sig" ? null : "key-sig"),
      "rehearsal-popover": () => setPopover(popover === "rehearsal" ? null : "rehearsal"),
      "barline-popover": () => setPopover(popover === "barline" ? null : "barline"),
      "navigation-popover": () => setPopover(popover === "navigation-marks" ? null : "navigation-marks"),

      // Articulations
      "articulation:accent": () => toggleArticulation("accent"),
      "articulation:staccato": () => toggleArticulation("staccato"),
      "articulation:tenuto": () => toggleArticulation("tenuto"),
      "articulation:fermata": () => toggleArticulation("fermata"),
      "articulation:marcato": () => toggleArticulation("marcato"),
      "articulation:trill": () => toggleArticulation("trill"),

      // Playback
      "play-pause": () => { if (isPlaying) pause(); else play(); },
      "stop-playback": () => stopPlayback(),
      "toggle-metronome": () => toggleMetronome(),
      "toggle-count-in": () => toggleCountIn(),
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (textInputMode) return;

      // When a popover is open, only handle Escape (popover handles its own keys)
      if (useEditorStore.getState().popover) {
        return;
      }

      // Tab input mode: intercept digit keys for fret entry and arrows for string nav
      if (isCursorOnTabStave()) {
        const state = useEditorStore.getState();
        const { tabFretBuffer, tabString } = state.inputState;

        // Digit keys → fret entry (multi-digit buffering: "1" then "2" → fret 12)
        if (e.key >= "0" && e.key <= "9" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const newBuffer = tabFretBuffer + e.key;
          const fretNum = parseInt(newBuffer, 10);

          // If first digit is 0 or buffer makes a fret > 24, insert immediately
          if (e.key === "0" && tabFretBuffer === "") {
            // Fret 0 — insert immediately
            insertTabNote(0, tabString);
            return;
          }

          if (fretNum > 24) {
            // Buffer overflow — insert previous buffer digit as fret, then start new buffer
            if (tabFretBuffer !== "") {
              insertTabNote(parseInt(tabFretBuffer, 10), tabString);
            }
            // Start new buffer with current digit
            useEditorStore.setState((s) => ({
              inputState: { ...s.inputState, tabFretBuffer: e.key },
            }));
            return;
          }

          if (newBuffer.length >= 2) {
            // Two digits accumulated — insert the fret
            insertTabNote(fretNum, tabString);
            return;
          }

          // Single digit 1-9 — buffer it, wait for possible second digit
          useEditorStore.setState((s) => ({
            inputState: { ...s.inputState, tabFretBuffer: newBuffer },
          }));

          // Auto-insert after a short delay if no second digit comes
          const currentBuffer = newBuffer;
          setTimeout(() => {
            const latest = useEditorStore.getState().inputState.tabFretBuffer;
            if (latest === currentBuffer) {
              insertTabNote(parseInt(currentBuffer, 10), useEditorStore.getState().inputState.tabString);
            }
          }, 500);
          return;
        }

        // Up/Down arrows → navigate strings (without ctrl/alt modifiers)
        if (e.key === "ArrowUp" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          if (tabFretBuffer) {
            insertTabNote(parseInt(tabFretBuffer, 10), tabString);
          }
          // Up = toward top of staff = string 1 (high E)
          const newString = Math.max(tabString - 1, 1);
          useEditorStore.setState((s) => ({
            inputState: { ...s.inputState, tabString: newString },
          }));
          return;
        }
        if (e.key === "ArrowDown" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          if (tabFretBuffer) {
            insertTabNote(parseInt(tabFretBuffer, 10), tabString);
          }
          // Down = toward bottom of staff = string 6 (low E)
          const newString = Math.min(tabString + 1, 6);
          useEditorStore.setState((s) => ({
            inputState: { ...s.inputState, tabString: newString },
          }));
          return;
        }

        // Left/Right arrows — flush fret buffer before cursor movement
        if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && tabFretBuffer) {
          insertTabNote(parseInt(tabFretBuffer, 10), tabString);
          // Fall through to normal cursor handling
        }

        // Tab technique shortcuts (Guitar Pro style single-key)
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          const key = e.key.toLowerCase();
          const TAB_TECHNIQUE_MAP: Record<string, import("../model/note").ArticulationKind> = {
            b: "bend",
            s: "slide-up",
            h: "hammer-on",
            p: "pull-off",
            v: "vibrato",
            x: "dead-note",
            o: "ghost-note",
            t: "tapping",
            m: "palm-mute",
            l: "let-ring",
          };
          if (key in TAB_TECHNIQUE_MAP) {
            e.preventDefault();
            if (tabFretBuffer) {
              insertTabNote(parseInt(tabFretBuffer, 10), tabString);
            }
            toggleArticulation(TAB_TECHNIQUE_MAP[key]);
            return;
          }
        }
      }

      // Shift+A-G: add pitch to chord at/before cursor (note entry only).
      // Outside note entry, Shift+letter falls through and does nothing (bare
      // letter handles commands there).
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k.length === 1 && k >= "a" && k <= "g") {
          const st = useEditorStore.getState();
          if (st.inputState.noteEntry) {
            const c = st.inputState.cursor;
            const v = st.score.parts[c.partIndex]?.measures[c.measureIndex]?.voices[c.voiceIndex];
            const candidate = v?.events[c.eventIndex] ?? (c.eventIndex > 0 ? v?.events[c.eventIndex - 1] : undefined);
            if (candidate && (candidate.kind === "note" || candidate.kind === "chord")) {
              e.preventDefault();
              addPitchToChord(k.toUpperCase() as PitchClass);
              return;
            }
          }
        }
      }

      const bindings = getSettings().keyBindings;
      const noteEntry = useEditorStore.getState().inputState.noteEntry;

      for (const [actionId, binding] of Object.entries(bindings)) {
        if (!actionActiveInMode(actionId, noteEntry)) continue;
        if (matchesBinding(e, binding)) {
          const handler = handlers[actionId];
          if (handler) {
            e.preventDefault();
            handler();
            emitFlash(actionId);
            return;
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    insertNote, addPitchToChord, cycleChordHead, insertRest, deleteNote, setDuration, toggleDot, setAccidental,
    moveCursor, changeOctave, nudgePitch, undo, redo, setVoice, insertMeasure, deleteMeasure,
    enterChordMode, enterLyricMode, textInputMode, isPlaying, play,
    pause, stopPlayback, toggleMetronome, toggleCountIn, moveCursorPart, moveCursorToMeasure, toggleNotation, selection,
    copySelection, pasteAtCursor, deleteSelectedMeasures, clearSelectedMeasures,
    toggleArticulation, toggleNoteEntry, toggleInsertMode, togglePitchBeforeDuration, toggleGraceNoteMode, toggleSlur, toggleTie, toggleMute, setHairpin, toggleCrossStaff, popover, setPopover,
    setSelection, setNoteSelection, extendSelection, extendNoteSelection,
    noteSelection, deleteNoteSelection, viewConfig, insertTabNote,
  ]);

  return null;
}
