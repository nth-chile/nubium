import { useEffect } from "react";
import { useEditorStore } from "../state";
import type { PitchClass, DurationType } from "../model";
import type { ViewModeType } from "../views/ViewMode";
import { getSettings, matchesBinding } from "../settings";

export function KeyboardShortcuts() {
  const insertNote = useEditorStore((s) => s.insertNote);
  const insertRest = useEditorStore((s) => s.insertRest);
  const deleteNote = useEditorStore((s) => s.deleteNote);
  const setDuration = useEditorStore((s) => s.setDuration);
  const toggleDot = useEditorStore((s) => s.toggleDot);
  const setAccidental = useEditorStore((s) => s.setAccidental);
  const moveCursor = useEditorStore((s) => s.moveCursor);
  const changeOctave = useEditorStore((s) => s.changeOctave);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setVoice = useEditorStore((s) => s.setVoice);
  const insertMeasure = useEditorStore((s) => s.insertMeasure);
  const deleteMeasure = useEditorStore((s) => s.deleteMeasure);
  const enterChordMode = useEditorStore((s) => s.enterChordMode);
  const enterLyricMode = useEditorStore((s) => s.enterLyricMode);
  const showLyrics = useEditorStore((s) => s.showLyrics);
  const textInputMode = useEditorStore((s) => s.inputState.textInputMode);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const play = useEditorStore((s) => s.play);
  const pause = useEditorStore((s) => s.pause);
  const stopPlayback = useEditorStore((s) => s.stopPlayback);
  const toggleMetronome = useEditorStore((s) => s.toggleMetronome);
  const moveCursorPart = useEditorStore((s) => s.moveCursorPart);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const toggleArticulation = useEditorStore((s) => s.toggleArticulation);
  const toggleStepEntry = useEditorStore((s) => s.toggleStepEntry);
  const setDynamicsPopoverOpen = useEditorStore((s) => s.setDynamicsPopoverOpen);
  const dynamicsPopoverOpen = useEditorStore((s) => s.dynamicsPopoverOpen);
  const selection = useEditorStore((s) => s.selection);
  const setSelection = useEditorStore((s) => s.setSelection);
  const extendSelection = useEditorStore((s) => s.extendSelection);
  const deleteSelectedMeasures = useEditorStore((s) => s.deleteSelectedMeasures);
  const copySelection = useEditorStore((s) => s.copySelection);
  const pasteAtCursor = useEditorStore((s) => s.pasteAtCursor);
  const clipboardMeasures = useEditorStore((s) => s.clipboardMeasures);

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
        if (selection) deleteSelectedMeasures();
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
      "toggle-step-entry": () => toggleStepEntry(),

      // Accidentals
      "accidental:sharp": () => setAccidental("sharp"),
      "accidental:flat": () => setAccidental("flat"),

      // Navigation
      "cursor:left": () => { if (selection) setSelection(null); moveCursor("left"); },
      "cursor:right": () => { if (selection) setSelection(null); moveCursor("right"); },
      "octave:up": () => changeOctave("up"),
      "octave:down": () => changeOctave("down"),
      "part:up": () => moveCursorPart("up"),
      "part:down": () => moveCursorPart("down"),

      // Selection
      "select:left": () => extendSelection("left"),
      "select:right": () => extendSelection("right"),
      "escape": () => setSelection(null),
      "copy": () => { if (selection) copySelection(); },
      "paste": () => { if (clipboardMeasures) pasteAtCursor(); },
      "cut": () => { if (selection) { copySelection(); deleteSelectedMeasures(); } },

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

      // Views
      "view:songwriter": () => setViewMode("songwriter" as ViewModeType),
      "view:lead-sheet": () => setViewMode("lead-sheet" as ViewModeType),
      "view:tab": () => setViewMode("tab" as ViewModeType),
      "view:full-score": () => setViewMode("full-score" as ViewModeType),

      // Annotation
      "chord-mode": () => enterChordMode(),
      "lyric-mode": () => { if (showLyrics) enterLyricMode(); },
      "dynamics-popover": () => setDynamicsPopoverOpen(!dynamicsPopoverOpen),

      // Articulations
      "articulation:accent": () => toggleArticulation("accent"),
      "articulation:staccato": () => toggleArticulation("staccato"),
      "articulation:tenuto": () => toggleArticulation("tenuto"),
      "articulation:fermata": () => toggleArticulation("fermata"),
      "articulation:marcato": () => toggleArticulation("marcato"),

      // Playback
      "play-pause": () => { if (isPlaying) pause(); else play(); },
      "stop-playback": () => stopPlayback(),
      "toggle-metronome": () => toggleMetronome(),
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (textInputMode) return;

      const bindings = getSettings().keyBindings;

      for (const [actionId, binding] of Object.entries(bindings)) {
        if (matchesBinding(e, binding)) {
          const handler = handlers[actionId];
          if (handler) {
            e.preventDefault();
            handler();
            return;
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    insertNote, insertRest, deleteNote, setDuration, toggleDot, setAccidental,
    moveCursor, changeOctave, undo, redo, setVoice, insertMeasure, deleteMeasure,
    enterChordMode, enterLyricMode, showLyrics, textInputMode, isPlaying, play,
    pause, stopPlayback, toggleMetronome, moveCursorPart, setViewMode, selection,
    copySelection, pasteAtCursor, clipboardMeasures, deleteSelectedMeasures,
    toggleArticulation, toggleStepEntry, setDynamicsPopoverOpen, dynamicsPopoverOpen,
    setSelection, extendSelection,
  ]);

  return null;
}
