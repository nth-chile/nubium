import { create } from "zustand";
import { serialize as serializeScore, deserialize as deserializeScore } from "../serialization";
import type {
  Score,
  Measure,
  DurationType,
  Accidental,
  PitchClass,
  Octave,
  NoteEventId,
  Clef,
  TimeSignature,
  KeySignature,
} from "../model";
import type { ClefType } from "../model";
import { defaultViewConfig, getEffectiveInputMode, getPartDisplay, type ViewConfig, type NotationDisplay } from "../views/ViewMode";
import { DURATION_TYPES_ORDERED } from "../model";
import { durationToTicks as durationToTicksFn, TICKS_PER_QUARTER } from "../model/duration";
import { factory } from "../model";
import { getInstrument } from "../model/instruments";
import { isCrossStaff } from "../model/note";
import { pitchToTab, STANDARD_TUNING } from "../model/guitar";
import { defaultInputState, type InputState, type CursorPosition } from "../input/InputState";
import { CommandHistory } from "../commands/CommandHistory";
import type { Selection, NoteSelection } from "../plugins/PluginAPI";
import { InsertNote } from "../commands/InsertNote";
import { InsertTabNote } from "../commands/InsertTabNote";
import { InsertModeNote } from "../commands/InsertModeNote";
import { InsertRest } from "../commands/InsertRest";
import { DeleteNote } from "../commands/DeleteNote";
import { ChangePitch } from "../commands/ChangePitch";
import { ChangeDuration } from "../commands/ChangeDuration";
import { InsertMeasure } from "../commands/InsertMeasure";
import { DeleteMeasure } from "../commands/DeleteMeasure";
import { DeleteSelectedMeasures } from "../commands/DeleteSelectedMeasures";
import { ChangeTimeSig } from "../commands/ChangeTimeSig";
import { ChangeKeySig } from "../commands/ChangeKeySig";
import { ChangeClef } from "../commands/ChangeClef";
import { SetChordSymbol } from "../commands/SetChordSymbol";
import { SetLyric } from "../commands/SetLyric";
import { SetRehearsalMark } from "../commands/SetRehearsalMark";
import { SetTempo } from "../commands/SetTempo";
import { SetSwing } from "../commands/SetSwing";
import { AddPart } from "../commands/AddPart";
import { RemovePart } from "../commands/RemovePart";
import { ReorderParts } from "../commands/ReorderParts";
import { SetRepeatBarline } from "../commands/SetRepeatBarline";
import { SetVolta } from "../commands/SetVolta";
import { SetNavigationMark } from "../commands/SetNavigationMark";
import { ToggleArticulation } from "../commands/ToggleArticulation";
import { ToggleCrossStaff } from "../commands/ToggleCrossStaff";
import { NudgePitch } from "../commands/NudgePitch";
import { SetDynamic } from "../commands/SetDynamic";
import { TogglePickup } from "../commands/TogglePickup";
import { SetSlur } from "../commands/SetSlur";
import { InsertGraceNote } from "../commands/InsertGraceNote";
import { OverwriteNote } from "../commands/OverwriteNote";
import { ToggleDot } from "../commands/ToggleDot";
import { SetAccidental as SetAccidentalCmd } from "../commands/SetAccidental";
import { ToggleTie } from "../commands/ToggleTie";
import { SetHairpin } from "../commands/SetHairpin";
import { SetStemDirection } from "../commands/SetStemDirection";
import { SetScoreMeta } from "../commands/SetScoreMeta";
import { SetPartProperty } from "../commands/SetPartProperty";
import type { NavigationMarkType } from "../commands/SetNavigationMark";
import type { BarlineType, Volta } from "../model";
import type { NoteBox, AnnotationBox } from "../renderer/vexBridge";
import { newId, type VoiceId, type MeasureId } from "../model/ids";
import { pitchToMidi, midiToPitch, stepUp, stepDown, keyAccidental } from "../model/pitch";
import { getGlobalPluginManager } from "../plugins/PluginManager";

const history = new CommandHistory();

const AUTOSAVE_KEY = "nubium-autosave";
const AUTOSAVE_DEBOUNCE_MS = 2000;

interface EditorStore {
  // Document
  score: Score;
  filePath: string | null;
  fileHandle: FileSystemFileHandle | null; // browser File System Access API handle
  saveConfirmed: boolean; // true after user confirms save destination this session
  autoSaveStatus: string | null;
  isDirty: boolean;
  cleanScoreJson: string | null; // serialized score at last save — used to detect dirty state

  // Input
  inputState: InputState;

  // Rendering
  noteBoxes: Map<NoteEventId, NoteBox>;
  hitBoxes: NoteBox[];
  annotationBoxes: AnnotationBox[];
  measurePositions: { partIndex: number; measureIndex: number; staveIndex: number; x: number; y: number; width: number; height: number; noteStartX: number; isTab?: boolean }[];
  titlePositions: { title?: { x: number; y: number; width: number; height: number }; composer?: { x: number; y: number; width: number; height: number } };
  editingTitle: boolean;
  editingComposer: boolean;
  selection: Selection | null;
  noteSelection: NoteSelection | null;
  clipboardMeasures: Measure[] | null;
  clipboardEvents: { voiceIndex: number; events: import("../model/note").NoteEvent[] } | null;
  /** Position of the last note entered — nudge commands target this when cursor has advanced past it */
  lastEnteredPosition: CursorPosition | null;

  // Actions
  insertNote(pitchClass: PitchClass): void;
  insertTabNote(fret: number, string: number): void;
  insertRest(): void;
  deleteNote(): void;
  setDuration(type: DurationType): void;
  toggleDot(): void;
  setAccidental(acc: Accidental): void;
  toggleStepEntry(): void;
  toggleInsertMode(): void;
  togglePitchBeforeDuration(): void;
  commitPendingPitch(): void;
  moveCursor(direction: "left" | "right"): void;
  moveCursorToMeasure(direction: "next" | "prev"): void;
  changeOctave(direction: "up" | "down"): void;
  nudgePitch(direction: "up" | "down", mode: "diatonic" | "chromatic" | "octave"): void;
  setScore(score: Score): void;
  setFilePath(path: string | null): void;
  setFileHandle(handle: FileSystemFileHandle | null): void;
  confirmSave(): void;
  setAutoSaveStatus(status: string | null): void;
  markClean(): void;
  setNoteBoxes(boxes: Map<NoteEventId, NoteBox>, hitBoxes?: NoteBox[]): void;
  setAnnotationBoxes(boxes: AnnotationBox[]): void;
  setMeasurePositions(positions: EditorStore["measurePositions"]): void;
  setTitlePositions(positions: EditorStore["titlePositions"]): void;
  setEditingTitle(editing: boolean): void;
  setEditingComposer(editing: boolean): void;
  setSelection(selection: Selection | null): void;
  setNoteSelection(sel: NoteSelection | null): void;
  extendNoteSelection(direction: "left" | "right"): void;
  selectNoteAtCursor(): void;
  deleteNoteSelection(): void;
  extendSelection(direction: "left" | "right"): void;
  deleteSelectedMeasures(): void;
  copySelection(): void;
  pasteAtCursor(): Promise<void>;
  setCursorDirect(cursor: CursorPosition, tabInputActive?: boolean): void;
  setTitle(title: string): void;
  setComposer(composer: string): void;
  undo(): void;
  redo(): void;

  // Articulations
  toggleArticulation(kind: import("../model/note").ArticulationKind): void;
  toggleCrossStaff(): void;
  toggleTie(): void;
  setStemDirection(direction: "up" | "down" | null): void;

  // Hairpin
  hairpinStartEventId: NoteEventId | null;
  setHairpin(type: "crescendo" | "diminuendo"): void;

  // Phase 2 actions
  changePitch(pitchClass: PitchClass): void;
  setVoice(n: number): void;
  insertMeasure(): void;
  deleteMeasure(): void;
  changeTimeSig(timeSig: TimeSignature): void;
  changeKeySig(keySig: KeySignature): void;
  changeClef(clef: Clef): void;

  // Phase 3 actions
  enterChordMode(): void;
  enterLyricMode(): void;
  editAnnotation(box: AnnotationBox): void;
  commitTextInput(text: string): void;
  cancelTextInput(): void;
  setLyricVerse(verse: number): void;

  // Phase 4: Playback
  isPlaying: boolean;
  playbackTick: number | null;
  tempo: number;
  metronomeOn: boolean;
  countInOn: boolean;
  play(): Promise<void> | void;
  pause(): void;
  stopPlayback(): void;
  setTempo(bpm: number): void;
  setSwing(swing: import("../model/annotations").SwingSettings | undefined): void;
  setPlaybackTick(tick: number | null): void;
  toggleMetronome(): void;
  toggleCountIn(): void;

  // Phase 5: Multi-track/Part management
  addPart(instrumentId: string): void;
  removePart(partIndex: number): void;
  reorderPart(partIndex: number, direction: "up" | "down"): void;
  toggleSolo(partIndex: number): void;
  toggleMute(partIndex: number): void;
  setPartTuning(partIndex: number, tuning: import("../model/guitar").Tuning | undefined): void;
  setPartCapo(partIndex: number, capo: number): void;
  togglePartVisibility(partIndex: number): void;
  hiddenParts: Set<number>;
  moveCursorToPart(partIndex: number): void;
  moveCursorPart(direction: "up" | "down"): void;

  // Phase 9: View modes
  viewConfig: ViewConfig;
  toggleNotation(type: "standard" | "tab" | "slash", partIndex?: number): void;
  /** Set notation display for a specific part directly */
  setPartNotation(partIndex: number, display: Partial<NotationDisplay>): void;

  // Phase 10: Navigation marks
  setRepeatBarline(barlineType: BarlineType): void;
  setVolta(volta: Volta | null): void;
  setNavigationMark(markType: NavigationMarkType, value?: string | boolean): void;

  // Popovers
  popover: "dynamics" | "tempo" | "time-sig" | "key-sig" | "rehearsal" | "barline" | "go-to-measure" | "navigation-marks" | null;
  setPopover(popover: EditorStore["popover"]): void;
  setDynamic(level: import("../model/annotations").DynamicLevel | null): void;
  setTempoMark(bpm: number, beatUnit?: DurationType, text?: string): void;
  setRehearsalMark(text: string): void;
  togglePickup(): void;
  toggleGraceNoteMode(): void;
  slurStartEventId: NoteEventId | null;
  toggleSlur(): void;

}

/** Default octave per clef — places notes in the middle of the staff */
const CLEF_DEFAULT_OCTAVE: Record<ClefType, number> = {
  treble: 4,
  bass: 3,
  alto: 4,
  tenor: 3,
};

/** Get the effective octave for note entry, applying clef offset to inputState octave.
 *  inputState.octave defaults to 4 (treble). For bass clef, this shifts down by 1, etc. */
function getEffectiveOctave(score: Score, cursor: CursorPosition, inputOctave: Octave): Octave {
  const measure = score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
  if (!measure) return inputOctave;

  // Bass staff on grand staff instruments uses bass clef octave
  if ((cursor.staveIndex ?? 0) >= 1) {
    const offset = (CLEF_DEFAULT_OCTAVE["bass"] ?? 3) - 4;
    return Math.max(0, Math.min(9, inputOctave + offset)) as Octave;
  }

  const offset = (CLEF_DEFAULT_OCTAVE[measure.clef.type] ?? 4) - 4;
  return Math.max(0, Math.min(9, inputOctave + offset)) as Octave;
}

/** Find the flat voice index for voice N on a given staff. Creates the voice if needed. */
function findOrCreateVoiceForStaff(measure: Measure, staveIndex: number, localVoiceN: number): number {
  const staffVoices = measure.voices
    .map((v, i) => ({ voice: v, flatIndex: i }))
    .filter((e) => (e.voice.staff ?? 0) === staveIndex);
  if (localVoiceN < staffVoices.length) {
    return staffVoices[localVoiceN].flatIndex;
  }
  // Create voices up to the requested local index
  let flatIndex = -1;
  for (let i = staffVoices.length; i <= localVoiceN; i++) {
    flatIndex = measure.voices.length;
    measure.voices.push({
      id: newId<VoiceId>("vce"),
      events: [],
      staff: staveIndex,
    });
  }
  return flatIndex;
}

/** Smart octave: pick the octave that places the note closest to the previous note's pitch.
 *  Returns the effective octave, applying clef offset. Falls back to clef-based default. */
function smartOctave(score: Score, cursor: CursorPosition, pitchClass: PitchClass): Octave {
  const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  // Look for the previous pitched event (in this voice, this measure, before cursor)
  let prevPitch: import("../model").Pitch | null = null;
  if (voice) {
    for (let i = cursor.eventIndex - 1; i >= 0; i--) {
      const evt = voice.events[i];
      if (!evt) continue;
      if (evt.kind === "note") { prevPitch = evt.head.pitch; break; }
      if (evt.kind === "chord" && evt.heads.length > 0) { prevPitch = evt.heads[0].pitch; break; }
      if (evt.kind === "grace") { prevPitch = evt.head.pitch; break; }
    }
  }
  // Also search previous measures in same voice
  if (!prevPitch) {
    const part = score.parts[cursor.partIndex];
    if (part) {
      for (let mi = cursor.measureIndex - 1; mi >= 0 && !prevPitch; mi--) {
        const v = part.measures[mi]?.voices[cursor.voiceIndex];
        if (!v) continue;
        for (let i = v.events.length - 1; i >= 0; i--) {
          const evt = v.events[i];
          if (!evt) continue;
          if (evt.kind === "note") { prevPitch = evt.head.pitch; break; }
          if (evt.kind === "chord" && evt.heads.length > 0) { prevPitch = evt.heads[0].pitch; break; }
          if (evt.kind === "grace") { prevPitch = evt.head.pitch; break; }
        }
      }
    }
  }
  if (!prevPitch) {
    // No previous note — use clef default
    const measure = score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
    if (!measure) return 4 as Octave;
    if ((cursor.staveIndex ?? 0) >= 1) return 3 as Octave;
    return (CLEF_DEFAULT_OCTAVE[measure.clef.type] ?? 4) as Octave;
  }

  // Find the octave for pitchClass that's closest to prevPitch
  const prevMidi = pitchToMidi(prevPitch);
  let bestOctave = 4 as Octave;
  let bestDist = Infinity;
  for (let o = 0; o <= 9; o++) {
    const midi = pitchToMidi({ pitchClass, accidental: "natural", octave: o as Octave });
    const dist = Math.abs(midi - prevMidi);
    if (dist < bestDist) {
      bestDist = dist;
      bestOctave = o as Octave;
    }
  }
  return bestOctave;
}

/** Returns true if the cursor is on an existing event (not past the end) */
function cursorOnExistingEvent(score: Score, cursor: CursorPosition): boolean {
  const voice =
    score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  if (!voice) return false;
  return cursor.eventIndex < voice.events.length;
}

const initialScore = factory.emptyScore();
export const useEditorStore = create<EditorStore>((set, get) => ({
  score: initialScore,
  filePath: null,
  fileHandle: null,
  saveConfirmed: false,
  autoSaveStatus: null,
  isDirty: false,
  cleanScoreJson: serializeScore(initialScore),
  inputState: defaultInputState(),
  noteBoxes: new Map(),
  hitBoxes: [],
  annotationBoxes: [],
  measurePositions: [],
  titlePositions: {},
  editingTitle: false,
  editingComposer: false,
  selection: null,
  noteSelection: null,
  clipboardMeasures: null,
  clipboardEvents: null,
  lastEnteredPosition: null,
  isPlaying: false,
  playbackTick: null,
  tempo: 120,
  metronomeOn: false,
  countInOn: false,
  viewConfig: defaultViewConfig(),
  hiddenParts: new Set<number>(),
  popover: null,

  setPopover(popover: EditorStore["popover"]) {
    set({ popover });
  },

  setDynamic(level: import("../model/annotations").DynamicLevel | null) {
    const state = get();
    const { cursor } = state.inputState;
    const voice = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
    if (!voice || voice.events.length === 0) return;
    // If cursor is past the last event, apply to the last event
    const evt = voice.events[cursor.eventIndex] ?? voice.events[voice.events.length - 1];
    if (!evt) return;
    const cmd = new SetDynamic(level, evt.id);
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState, popover: null });
  },

  setTempoMark(bpm: number, beatUnit: DurationType = "quarter", text?: string) {
    const state = get();
    const cmd = new SetTempo(bpm, beatUnit, text);
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState, popover: null });
  },

  setRehearsalMark(text: string) {
    const state = get();
    const cmd = new SetRehearsalMark(text);
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState, popover: null });
  },

  togglePickup() {
    const state = get();
    const cmd = new TogglePickup();
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState });
  },

  toggleGraceNoteMode() {
    set((s) => ({
      inputState: { ...s.inputState, graceNoteMode: !s.inputState.graceNoteMode },
    }));
  },

  slurStartEventId: null,

  toggleSlur() {
    const state = get();
    const { cursor } = state.inputState;
    const voice = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
    const evt = voice?.events[cursor.eventIndex];
    if (!evt || evt.kind === "rest") return;

    if (!state.slurStartEventId) {
      // Mark slur start
      set({ slurStartEventId: evt.id });
    } else {
      // Complete slur
      const cmd = new SetSlur(state.slurStartEventId, evt.id);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState, slurStartEventId: null });
    }
  },

  toggleTie() {
    const state = get();
    const cmd = new ToggleTie();
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState });
  },

  hairpinStartEventId: null,

  setHairpin(type: "crescendo" | "diminuendo") {
    const state = get();
    const { cursor } = state.inputState;
    const voice = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
    const evt = voice?.events[cursor.eventIndex];
    if (!evt || evt.kind === "rest") return;

    if (!state.hairpinStartEventId) {
      set({ hairpinStartEventId: evt.id });
    } else {
      const cmd = new SetHairpin(type, state.hairpinStartEventId, evt.id);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState, hairpinStartEventId: null });
    }
  },

  setStemDirection(direction: "up" | "down" | null) {
    const state = get();
    const cmd = new SetStemDirection(direction);
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState });
  },

  insertNote(pitchClass: PitchClass) {
    const state = get();
    const { cursor } = state.inputState;
    const octave = smartOctave(state.score, cursor, pitchClass);

    // Resolve accidental: if user hasn't explicitly set one, use key signature default
    const measure = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
    const fifths = measure?.keySignature?.fifths ?? 0;
    const acc = state.inputState.accidentalExplicit
      ? state.inputState.accidental
      : keyAccidental(pitchClass, fifths);

    // Pitch-before-duration: set pending pitch, don't insert yet
    if (state.inputState.pitchBeforeDuration) {
      set({
        inputState: {
          ...state.inputState,
          pendingPitch: { pitchClass, octave, accidental: acc },
        },
      });
      return;
    }

    // Grace note mode: insert a grace note before the current event
    if (state.inputState.graceNoteMode) {
      const cmd = new InsertGraceNote(
        pitchClass,
        octave,
        acc,
      );
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState, lastEnteredPosition: { ...cursor } });
      return;
    }

    // Insert mode: push subsequent events forward
    if (state.inputState.insertMode) {
      const cmd = new InsertModeNote(
        pitchClass,
        octave,
        acc,
        { ...state.inputState.duration },
      );
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({ score: result.score, inputState: result.inputState, lastEnteredPosition: { ...cursor } });
      return;
    }

    // Step entry mode: overwrite existing events with input duration
    if (state.inputState.stepEntry && cursorOnExistingEvent(state.score, cursor)) {
      const cmd = new OverwriteNote(
        pitchClass,
        octave,
        acc,
        { ...state.inputState.duration },
      );
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({
        score: result.score,
        inputState: result.inputState,
        lastEnteredPosition: { ...cursor },
      });
      return;
    }

    // If cursor is on an existing note, change pitch instead of inserting
    if (cursorOnExistingEvent(state.score, cursor)) {
      const cmd = new ChangePitch(
        pitchClass,
        octave,
        acc
      );
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({
        score: result.score,
        inputState: result.inputState,
        lastEnteredPosition: { ...cursor },
      });
      return;
    }

    const cmd = new InsertNote(
      pitchClass,
      octave,
      acc,
      { ...state.inputState.duration }
    );
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
      lastEnteredPosition: { ...cursor },
    });
  },

  insertTabNote(fret: number, string: number) {
    const state = get();
    const { cursor } = state.inputState;
    const part = state.score.parts[cursor.partIndex];
    if (!part) return;
    const tuning = part.tuning;
    const capo = part.capo ?? 0;
    const cmd = new InsertTabNote(fret, string, { ...state.inputState.duration }, tuning, capo);
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState, lastEnteredPosition: { ...cursor } });
  },

  insertRest() {
    const state = get();
    if (state.inputState.insertMode) {
      const cmd = new InsertModeNote("C", 4, "natural", { ...state.inputState.duration }, true);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState, lastEnteredPosition: null });
      return;
    }
    // Overwrite existing event with a rest (matching note overwrite/change behavior)
    const { cursor } = state.inputState;
    if (cursorOnExistingEvent(state.score, cursor)) {
      const cmd: import("../commands/Command").Command = {
        description: "Overwrite with rest",
        execute(s) {
          const sc = structuredClone(s.score);
          const inp = structuredClone(s.inputState);
          const v = sc.parts[inp.cursor.partIndex]?.measures[inp.cursor.measureIndex]?.voices[inp.cursor.voiceIndex];
          if (!v) return s;
          v.events[inp.cursor.eventIndex] = {
            kind: "rest",
            id: newId<import("../model/ids").NoteEventId>("evt"),
            duration: { ...inp.duration },
          };
          inp.cursor.eventIndex += 1;
          return { score: sc, inputState: inp };
        },
        undo(s) { return s; },
      };
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState, lastEnteredPosition: null });
      return;
    }
    const cmd = new InsertRest({ ...state.inputState.duration });
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
      lastEnteredPosition: null,
    });
  },

  deleteNote() {
    const state = get();
    const cmd = new DeleteNote();
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
      lastEnteredPosition: null,
    });
  },

  setDuration(type: DurationType) {
    const state = get();
    // Pitch-before-duration: if there's a pending pitch, commit it with this duration
    if (state.inputState.pendingPitch) {
      const pending = state.inputState.pendingPitch;
      const cursor = state.inputState.cursor;
      if (cursorOnExistingEvent(state.score, cursor)) {
        // Re-pitch existing note + change duration
        const cmd = new ChangePitch(pending.pitchClass, pending.octave, pending.accidental);
        const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
        // Also change duration
        const score2 = structuredClone(result.score);
        const voice = score2.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
        if (voice && cursor.eventIndex < voice.events.length) {
          voice.events[cursor.eventIndex] = { ...voice.events[cursor.eventIndex], duration: { type, dots: 0 } };
        }
        set({
          score: score2,
          inputState: { ...result.inputState, duration: { type, dots: 0 }, pendingPitch: null },
          lastEnteredPosition: { ...cursor },
        });
      } else {
        // Insert new note
        const cmd = new InsertNote(
          pending.pitchClass,
          pending.octave,
          pending.accidental,
          { type, dots: 0 },
        );
        const result = history.execute(cmd, {
          score: state.score,
          inputState: state.inputState,
        });
        set({
          score: result.score,
          inputState: { ...result.inputState, duration: { type, dots: 0 }, pendingPitch: null },
          lastEnteredPosition: { ...cursor },
        });
      }
      return;
    }
    // Note-level selection: change duration of selected events
    if (state.noteSelection) {
      const ns = state.noteSelection;
      history.pushSnapshot({ score: state.score, inputState: state.inputState });
      const score = structuredClone(state.score);
      for (let mi = ns.startMeasure; mi <= ns.endMeasure; mi++) {
        const voice = score.parts[ns.partIndex]?.measures[mi]?.voices[ns.voiceIndex];
        if (!voice) continue;
        const startIdx = mi === ns.startMeasure ? ns.startEvent : 0;
        const endIdx = mi === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
        for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
          voice.events[i] = { ...voice.events[i], duration: { type, dots: 0 } };
        }
      }
      set({ score });
    } else if (state.selection && !state.inputState.stepEntry) {
      const { partIndex, measureStart, measureEnd } = state.selection;
      history.pushSnapshot({ score: state.score, inputState: state.inputState });
      const score = structuredClone(state.score);
      const part = score.parts[partIndex];
      if (!part) return;
      for (let mi = measureStart; mi <= measureEnd; mi++) {
        const measure = part.measures[mi];
        if (!measure) continue;
        for (const voice of measure.voices) {
          voice.events = voice.events.map((ev) => ({
            ...ev,
            duration: { ...ev.duration, type },
          }));
        }
      }
      set({ score });
    } else if (cursorOnExistingEvent(state.score, state.inputState.cursor)) {
      // Single note at cursor: change its duration via command
      const cmd = new ChangeDuration({ type, dots: 0 });
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    }
    set((s) => ({
      inputState: {
        ...s.inputState,
        duration: { type, dots: 0 },
      },
    }));
  },

  toggleDot() {
    const state = get();
    const { cursor } = state.inputState;
    const newDots = ((state.inputState.duration.dots + 1) % 4) as 0 | 1 | 2 | 3;

    // Note-level selection: toggle dot on selected events
    if (state.noteSelection) {
      const ns = state.noteSelection;
      history.pushSnapshot({ score: state.score, inputState: state.inputState });
      const score = structuredClone(state.score);
      for (let mi = ns.startMeasure; mi <= ns.endMeasure; mi++) {
        const voice = score.parts[ns.partIndex]?.measures[mi]?.voices[ns.voiceIndex];
        if (!voice) continue;
        const startIdx = mi === ns.startMeasure ? ns.startEvent : 0;
        const endIdx = mi === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
        for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
          const ev = voice.events[i];
          const dots = ((ev.duration.dots + 1) % 4) as 0 | 1 | 2 | 3;
          voice.events[i] = { ...ev, duration: { ...ev.duration, dots } };
        }
      }
      set({ score });
    } else if (state.selection && !state.inputState.stepEntry) {
      // Bar-level selection: toggle dot on all events in selected measures
      const { partIndex, measureStart, measureEnd } = state.selection;
      history.pushSnapshot({ score: state.score, inputState: state.inputState });
      const score = structuredClone(state.score);
      const part = score.parts[partIndex];
      if (part) {
        for (let mi = measureStart; mi <= measureEnd; mi++) {
          const measure = part.measures[mi];
          if (!measure) continue;
          for (const voice of measure.voices) {
            voice.events = voice.events.map((ev) => {
              const dots = ((ev.duration.dots + 1) % 4) as 0 | 1 | 2 | 3;
              return { ...ev, duration: { ...ev.duration, dots } };
            });
          }
        }
        set({ score });
      }
    } else if (cursorOnExistingEvent(state.score, cursor)) {
      // Single note at cursor
      const cmd = new ToggleDot();
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({ score: result.score, inputState: result.inputState });
    }

    set((s) => ({
      inputState: {
        ...s.inputState,
        duration: { ...s.inputState.duration, dots: newDots },
      },
    }));
  },

  setAccidental(acc: Accidental) {
    const state = get();
    const { cursor } = state.inputState;

    // Helper to apply accidental to a single event
    const applyAccToEvent = (ev: import("../model/note").NoteEvent, targetAcc: Accidental): import("../model/note").NoteEvent => {
      if (ev.kind === "note" || ev.kind === "grace") {
        return { ...ev, head: { ...ev.head, pitch: { ...ev.head.pitch, accidental: targetAcc } } };
      } else if (ev.kind === "chord") {
        return { ...ev, heads: ev.heads.map((h) => ({ ...h, pitch: { ...h.pitch, accidental: targetAcc } })) };
      }
      return ev;
    };

    // Note-level selection: apply accidental to selected events
    if (state.noteSelection) {
      const ns = state.noteSelection;
      const score = structuredClone(state.score);
      for (let mi = ns.startMeasure; mi <= ns.endMeasure; mi++) {
        const voice = score.parts[ns.partIndex]?.measures[mi]?.voices[ns.voiceIndex];
        if (!voice) continue;
        const startIdx = mi === ns.startMeasure ? ns.startEvent : 0;
        const endIdx = mi === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
        for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
          voice.events[i] = applyAccToEvent(voice.events[i], acc);
        }
      }
      set({ score, inputState: { ...state.inputState, accidental: acc, accidentalExplicit: true } });
      return;
    }

    // Bar-level selection: apply accidental to all pitched events
    if (state.selection && !state.inputState.stepEntry) {
      const { partIndex, measureStart, measureEnd } = state.selection;
      const score = structuredClone(state.score);
      const part = score.parts[partIndex];
      if (part) {
        for (let mi = measureStart; mi <= measureEnd; mi++) {
          const measure = part.measures[mi];
          if (!measure) continue;
          for (const voice of measure.voices) {
            voice.events = voice.events.map((ev) => applyAccToEvent(ev, acc));
          }
        }
        set({ score, inputState: { ...state.inputState, accidental: acc, accidentalExplicit: true } });
      }
      return;
    }

    // When on an existing note, toggle based on the note's actual accidental
    if (cursorOnExistingEvent(state.score, cursor)) {
      const voice = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      const event = voice?.events[cursor.eventIndex];
      let noteAcc: Accidental = "natural";
      if (event?.kind === "note" || event?.kind === "grace") {
        noteAcc = event.head.pitch.accidental ?? "natural";
      } else if (event?.kind === "chord" && event.heads.length > 0) {
        noteAcc = event.heads[0].pitch.accidental ?? "natural";
      }
      const newAcc = noteAcc === acc ? "natural" : acc;
      const cmd = new SetAccidentalCmd(newAcc);
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({
        score: result.score,
        inputState: { ...result.inputState, accidental: newAcc, accidentalExplicit: true },
      });
      return;
    }

    // No note at cursor — just toggle input state
    const newAcc = state.inputState.accidental === acc ? "natural" : acc;
    set((s) => ({
      inputState: {
        ...s.inputState,
        accidental: newAcc,
        accidentalExplicit: newAcc !== "natural",
      },
    }));
  },

  toggleStepEntry() {
    set((s) => {
      const newStep = !s.inputState.stepEntry;
      const cursor = s.inputState.cursor;
      // Entering step entry (not insert): auto-select note at cursor
      // Leaving step entry: clear note selection
      let noteSelection = s.noteSelection;
      if (newStep && !s.inputState.insertMode && cursorOnExistingEvent(s.score, cursor)) {
        noteSelection = {
          partIndex: cursor.partIndex,
          voiceIndex: cursor.voiceIndex,
          startMeasure: cursor.measureIndex,
          startEvent: cursor.eventIndex,
          endMeasure: cursor.measureIndex,
          endEvent: cursor.eventIndex,
          anchorMeasure: cursor.measureIndex,
          anchorEvent: cursor.eventIndex,
        };
      } else if (!newStep) {
        noteSelection = null;
      }
      return {
        inputState: { ...s.inputState, stepEntry: newStep },
        noteSelection,
      };
    });
  },

  toggleInsertMode() {
    set((s) => {
      const newInsert = !s.inputState.insertMode;
      const newStep = newInsert ? true : s.inputState.stepEntry;
      // Insert mode on: clear note selection (cursor is insertion point)
      // Insert mode off, still in step entry: auto-select note at cursor
      const cursor = s.inputState.cursor;
      let noteSelection = s.noteSelection;
      if (newInsert) {
        noteSelection = null;
      } else if (newStep && cursorOnExistingEvent(s.score, cursor)) {
        noteSelection = {
          partIndex: cursor.partIndex,
          voiceIndex: cursor.voiceIndex,
          startMeasure: cursor.measureIndex,
          startEvent: cursor.eventIndex,
          endMeasure: cursor.measureIndex,
          endEvent: cursor.eventIndex,
          anchorMeasure: cursor.measureIndex,
          anchorEvent: cursor.eventIndex,
        };
      }
      updateSettings({ insertMode: newInsert });
      return {
        inputState: { ...s.inputState, insertMode: newInsert, stepEntry: newStep },
        noteSelection,
      };
    });
  },

  togglePitchBeforeDuration() {
    set((s) => {
      const newVal = !s.inputState.pitchBeforeDuration;
      updateSettings({ pitchBeforeDuration: newVal });
      return {
        inputState: {
          ...s.inputState,
          pitchBeforeDuration: newVal,
          pendingPitch: null,
        },
      };
    });
  },

  commitPendingPitch() {
    const state = get();
    const pending = state.inputState.pendingPitch;
    if (!pending) return;

    const cmd = new InsertNote(
      pending.pitchClass,
      pending.octave,
      pending.accidental,
      { ...state.inputState.duration },
    );
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    // Note position is the cursor before the command advanced it
    const notePos = { ...state.inputState.cursor };
    set({
      score: result.score,
      inputState: { ...result.inputState, pendingPitch: null },
      lastEnteredPosition: notePos,
    });
  },

  moveCursor(direction: "left" | "right") {
    set((s) => {
      const cursor = { ...s.inputState.cursor };
      const part = s.score.parts[cursor.partIndex];
      const voice = part?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      // Allow navigation even when voice doesn't exist in current measure
      const eventCount = voice?.events.length ?? 0;
      // Allow the append position (past last note) for inserting new notes.
      if (direction === "right") {
        if (cursor.eventIndex < eventCount) {
          cursor.eventIndex++;
        } else {
          // Move to next measure
          if (part && cursor.measureIndex < part.measures.length - 1) {
            cursor.measureIndex++;
            cursor.eventIndex = 0;
          }
        }
      } else {
        if (cursor.eventIndex > 0) {
          cursor.eventIndex--;
        } else if (cursor.measureIndex > 0) {
          cursor.measureIndex--;
          const prevVoice = part?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
          const prevCount = prevVoice?.events.length ?? 0;
          cursor.eventIndex = Math.max(0, prevCount - 1);
        }
      }

      return { inputState: { ...s.inputState, cursor, pendingPitch: null }, lastEnteredPosition: null };
    });
  },

  moveCursorToMeasure(direction: "next" | "prev") {
    set((s) => {
      const cursor = { ...s.inputState.cursor };
      const part = s.score.parts[cursor.partIndex];
      if (!part) return s;

      if (direction === "next" && cursor.measureIndex < part.measures.length - 1) {
        cursor.measureIndex++;
        cursor.eventIndex = 0;
      } else if (direction === "prev" && cursor.measureIndex > 0) {
        cursor.measureIndex--;
        cursor.eventIndex = 0;
      }

      return { inputState: { ...s.inputState, cursor }, lastEnteredPosition: null };
    });
  },

  changeOctave(direction: "up" | "down") {
    const state = get();
    // Pending pitch in pitch-before-duration mode: adjust the pending pitch
    if (state.inputState.pendingPitch) {
      const p = state.inputState.pendingPitch;
      const newOct = p.octave + (direction === "up" ? 1 : -1);
      if (newOct < 0 || newOct > 9) return;
      set({
        inputState: {
          ...state.inputState,
          pendingPitch: { ...p, octave: newOct as Octave },
        },
      });
      return;
    }
    // If cursor is on an existing note, nudge it by octave
    if (cursorOnExistingEvent(state.score, state.inputState.cursor)) {
      const cmd = new NudgePitch(direction, "octave");
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
      return;
    }
    // If we just entered a note (cursor advanced past it), nudge that note
    if (state.lastEnteredPosition && cursorOnExistingEvent(state.score, state.lastEnteredPosition)) {
      const tempInput = { ...state.inputState, cursor: { ...state.lastEnteredPosition } };
      const cmd = new NudgePitch(direction, "octave");
      const result = history.execute(cmd, { score: state.score, inputState: tempInput });
      set({ score: result.score, inputState: state.inputState });
      return;
    }
  },

  nudgePitch(direction: "up" | "down", mode: "diatonic" | "chromatic" | "octave") {
    const state = get();
    // Pending pitch in pitch-before-duration mode: adjust the pending pitch
    if (state.inputState.pendingPitch) {
      const p = state.inputState.pendingPitch;
      const pitch: import("../model").Pitch = { pitchClass: p.pitchClass, accidental: p.accidental, octave: p.octave };
      let newPitch: import("../model").Pitch;
      if (mode === "diatonic") {
        newPitch = direction === "up" ? stepUp(pitch) : stepDown(pitch);
      } else if (mode === "chromatic") {
        const midi = pitchToMidi(pitch) + (direction === "up" ? 1 : -1);
        if (midi < 0 || midi > 127) return;
        newPitch = midiToPitch(midi);
      } else {
        const newOct = pitch.octave + (direction === "up" ? 1 : -1);
        if (newOct < 0 || newOct > 9) return;
        newPitch = { ...pitch, octave: newOct as Octave };
      }
      set({
        inputState: {
          ...state.inputState,
          pendingPitch: { pitchClass: newPitch.pitchClass, octave: newPitch.octave, accidental: newPitch.accidental },
        },
      });
      return;
    }
    // If cursor is on an existing note, nudge it directly
    if (cursorOnExistingEvent(state.score, state.inputState.cursor)) {
      const cmd = new NudgePitch(direction, mode);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
      return;
    }
    // If we just entered a note (cursor advanced past it), nudge that note
    if (state.lastEnteredPosition && cursorOnExistingEvent(state.score, state.lastEnteredPosition)) {
      const tempInput = { ...state.inputState, cursor: { ...state.lastEnteredPosition } };
      const cmd = new NudgePitch(direction, mode);
      const result = history.execute(cmd, { score: state.score, inputState: tempInput });
      // Keep the current cursor position (don't jump back)
      set({ score: result.score, inputState: state.inputState });
      return;
    }
  },

  setScore(score: Score) {
    const state = get();
    history.pushSnapshot({ score: state.score, inputState: state.inputState });
    set((s) => ({
      score,
      viewConfig: { ...s.viewConfig, notationDisplay: {} },
    }));
  },

  setFilePath(path: string | null) {
    const prev = get().filePath;
    if (path !== prev) {
      set({ filePath: path, fileHandle: null, saveConfirmed: false });
    }
  },

  setFileHandle(handle: FileSystemFileHandle | null) {
    set({ fileHandle: handle });
  },

  confirmSave() {
    set({ saveConfirmed: true });
  },

  setAutoSaveStatus(status: string | null) {
    set({ autoSaveStatus: status });
  },

  markClean() {
    set({ isDirty: false, cleanScoreJson: serializeScore(get().score) });
  },

  setNoteBoxes(boxes: Map<NoteEventId, NoteBox>, hitBoxes?: NoteBox[]) {
    set({ noteBoxes: boxes, hitBoxes: hitBoxes ?? [...boxes.values()] });
  },

  setAnnotationBoxes(boxes: AnnotationBox[]) {
    set({ annotationBoxes: boxes });
  },

  setMeasurePositions(positions) {
    set({ measurePositions: positions });
  },

  setTitlePositions(positions) {
    set({ titlePositions: positions });
  },

  setEditingTitle(editing) {
    set({ editingTitle: editing });
  },

  setEditingComposer(editing) {
    set({ editingComposer: editing });
  },

  setSelection(selection) {
    set({ selection, noteSelection: null });
  },

  setNoteSelection(sel) {
    set({ noteSelection: sel, selection: null });
  },

  selectNoteAtCursor() {
    const { cursor } = get().inputState;
    const voice = get().score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
    if (!voice || cursor.eventIndex >= voice.events.length) return;
    set({
      noteSelection: {
        partIndex: cursor.partIndex,
        voiceIndex: cursor.voiceIndex,
        startMeasure: cursor.measureIndex,
        startEvent: cursor.eventIndex,
        endMeasure: cursor.measureIndex,
        endEvent: cursor.eventIndex,
        anchorMeasure: cursor.measureIndex,
        anchorEvent: cursor.eventIndex,
      },
      selection: null,
    });
  },

  extendNoteSelection(direction) {
    set((s) => {
      const { cursor } = s.inputState;
      const part = s.score.parts[cursor.partIndex];
      if (!part) return s;

      const ns = s.noteSelection ?? {
        partIndex: cursor.partIndex,
        voiceIndex: cursor.voiceIndex,
        startMeasure: cursor.measureIndex,
        startEvent: cursor.eventIndex,
        endMeasure: cursor.measureIndex,
        endEvent: cursor.eventIndex,
        anchorMeasure: cursor.measureIndex,
        anchorEvent: cursor.eventIndex,
      };

      // Moving end: the end that isn't the anchor
      let movMeasure = (ns.endMeasure === ns.anchorMeasure && ns.endEvent === ns.anchorEvent)
        ? ns.startMeasure : ns.endMeasure;
      let movEvent = (ns.endMeasure === ns.anchorMeasure && ns.endEvent === ns.anchorEvent)
        ? ns.startEvent : ns.endEvent;

      const voice = part.measures[movMeasure]?.voices[ns.voiceIndex];
      const eventCount = voice?.events.length ?? 0;

      if (direction === "right") {
        if (movEvent < eventCount - 1) {
          movEvent++;
        } else if (movMeasure < part.measures.length - 1) {
          // Cross to next measure
          movMeasure++;
          movEvent = 0;
        }
      } else {
        if (movEvent > 0) {
          movEvent--;
        } else if (movMeasure > 0) {
          // Cross to previous measure
          movMeasure--;
          const prevVoice = part.measures[movMeasure]?.voices[ns.voiceIndex];
          movEvent = Math.max(0, (prevVoice?.events.length ?? 1) - 1);
        }
      }

      // Determine start/end by comparing anchor vs moving position
      const anchorPos = ns.anchorMeasure * 10000 + ns.anchorEvent;
      const movPos = movMeasure * 10000 + movEvent;
      const startFirst = anchorPos <= movPos;

      return {
        noteSelection: {
          ...ns,
          anchorMeasure: ns.anchorMeasure,
          anchorEvent: ns.anchorEvent,
          startMeasure: startFirst ? ns.anchorMeasure : movMeasure,
          startEvent: startFirst ? ns.anchorEvent : movEvent,
          endMeasure: startFirst ? movMeasure : ns.anchorMeasure,
          endEvent: startFirst ? movEvent : ns.anchorEvent,
        },
        inputState: {
          ...s.inputState,
          cursor: { ...cursor, measureIndex: movMeasure, eventIndex: movEvent },
        },
        selection: null,
      };
    });
  },

  deleteNoteSelection() {
    const state = get();
    const ns = state.noteSelection;
    if (!ns) return;
    const score = structuredClone(state.score);
    // Delete selected events across measures (reverse order to preserve indices)
    for (let mi = ns.endMeasure; mi >= ns.startMeasure; mi--) {
      const voice = score.parts[ns.partIndex]?.measures[mi]?.voices[ns.voiceIndex];
      if (!voice) continue;
      const startIdx = mi === ns.startMeasure ? ns.startEvent : 0;
      const endIdx = mi === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
      voice.events.splice(startIdx, endIdx - startIdx + 1);
    }
    const input = structuredClone(state.inputState);
    input.cursor.measureIndex = ns.startMeasure;
    const startVoice = score.parts[ns.partIndex]?.measures[ns.startMeasure]?.voices[ns.voiceIndex];
    input.cursor.eventIndex = Math.min(ns.startEvent, startVoice?.events.length ?? 0);
    set({ score, inputState: input, noteSelection: null });
  },

  extendSelection(direction: "left" | "right") {
    const state = get();
    const { cursor } = state.inputState;
    const part = state.score.parts[cursor.partIndex];
    if (!part) return;

    // First press: just select the current measure
    if (!state.selection) {
      set({
        selection: { partIndex: cursor.partIndex, measureStart: cursor.measureIndex, measureEnd: cursor.measureIndex, measureAnchor: cursor.measureIndex },
        noteSelection: null,
      });
      return;
    }

    // Subsequent presses: shrink back toward anchor first, then extend past it
    const sel = state.selection;
    if (direction === "right") {
      if (sel.measureStart < sel.measureAnchor) {
        // Shrink from the left toward anchor
        set({ selection: { ...sel, measureStart: sel.measureStart + 1 }, noteSelection: null });
      } else {
        // Extend right
        const newEnd = Math.min(sel.measureEnd + 1, part.measures.length - 1);
        set({ selection: { ...sel, measureEnd: newEnd }, noteSelection: null });
      }
    } else {
      if (sel.measureEnd > sel.measureAnchor) {
        // Shrink from the right toward anchor
        set({ selection: { ...sel, measureEnd: sel.measureEnd - 1 }, noteSelection: null });
      } else {
        // Extend left
        const newStart = Math.max(sel.measureStart - 1, 0);
        set({ selection: { ...sel, measureStart: newStart }, noteSelection: null });
      }
    }
  },

  deleteSelectedMeasures() {
    const state = get();
    if (!state.selection) return;
    const cmd = new DeleteSelectedMeasures(state.selection);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
      selection: null,
    });
  },

  copySelection() {
    const state = get();
    if (state.selection) {
      const { partIndex, measureStart, measureEnd } = state.selection;
      const part = state.score.parts[partIndex];
      if (!part) return;
      const measures = part.measures.slice(measureStart, measureEnd + 1);
      const cloned = structuredClone(measures);
      set({ clipboardMeasures: cloned, clipboardEvents: null });
      // Write to system clipboard for cross-tab support
      const payload = JSON.stringify({ nubium: "measures", data: cloned });
      navigator.clipboard.writeText(payload).catch(() => {});
    } else if (state.noteSelection) {
      const ns = state.noteSelection;
      const part = state.score.parts[ns.partIndex];
      if (!part) return;
      // Collect only the selected events from the active voice
      const events: import("../model/note").NoteEvent[] = [];
      for (let m = ns.startMeasure; m <= ns.endMeasure; m++) {
        const voice = part.measures[m]?.voices[ns.voiceIndex];
        if (!voice) continue;
        const startIdx = m === ns.startMeasure ? ns.startEvent : 0;
        const endIdx = m === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
        events.push(...voice.events.slice(startIdx, endIdx + 1));
      }
      const cloned = structuredClone({ voiceIndex: ns.voiceIndex, events });
      set({ clipboardEvents: cloned, clipboardMeasures: null });
      // Write to system clipboard for cross-tab support
      const payload = JSON.stringify({ nubium: "events", data: cloned });
      navigator.clipboard.writeText(payload).catch(() => {});
    }
  },

  async pasteAtCursor() {
    // Try reading from system clipboard for cross-tab support
    let systemClipboard: { nubium: string; data: any } | null = null;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed?.nubium === "measures" || parsed?.nubium === "events") {
          systemClipboard = parsed;
        }
      }
    } catch {
      // System clipboard not available or doesn't contain our data
    }

    const state = get();
    const { cursor } = state.inputState;

    // Prefer system clipboard data over in-memory (enables cross-tab paste)
    const clipboardEvents = systemClipboard?.nubium === "events"
      ? systemClipboard.data as { voiceIndex: number; events: import("../model/note").NoteEvent[] }
      : state.clipboardEvents;
    const clipboardMeasures = systemClipboard?.nubium === "measures"
      ? systemClipboard.data as Measure[]
      : state.clipboardMeasures;

    // Note-level paste: overwrite events at cursor position
    if (clipboardEvents && clipboardEvents.events.length > 0) {
      const score = structuredClone(state.score);
      const part = score.parts[cursor.partIndex];
      if (!part) return;
      const measure = part.measures[cursor.measureIndex];
      if (!measure) return;
      const voice = measure.voices[cursor.voiceIndex];
      if (!voice) return;

      const newEvents = structuredClone(clipboardEvents.events).map((e: any) => {
        e.id = newId<NoteEventId>("evt");
        return e;
      });
      const replaceCount = Math.min(newEvents.length, voice.events.length - cursor.eventIndex);
      voice.events.splice(cursor.eventIndex, replaceCount, ...newEvents);

      const newEventIdx = Math.min(cursor.eventIndex + newEvents.length, voice.events.length) - 1;
      // Push snapshot for undo (before-paste state)
      history.pushSnapshot({ score: state.score, inputState: state.inputState });
      set({
        score,
        inputState: { ...state.inputState, cursor: { ...cursor, eventIndex: Math.max(0, newEventIdx) } },
        selection: null,
        noteSelection: null,
      });
      return;
    }

    // Measure-level paste
    if (!clipboardMeasures || clipboardMeasures.length === 0) return;
    const score = structuredClone(state.score);
    const part = score.parts[cursor.partIndex];
    if (!part) return;

    history.pushSnapshot({ score: state.score, inputState: state.inputState });

    const refMeasure = part.measures[cursor.measureIndex];
    const targetInstrument = getInstrument(part.instrumentId);
    const targetStaves = targetInstrument?.staves ?? 1;

    const measuresToInsert: Measure[] = structuredClone(clipboardMeasures).map((m) => {
      m.id = newId<MeasureId>("msr");

      if (refMeasure) {
        m.clef = { ...refMeasure.clef };
        m.keySignature = { ...refMeasure.keySignature };
        m.timeSignature = { ...refMeasure.timeSignature };
      }

      m.annotations = m.annotations.filter(
        (a) => a.kind !== "chord-symbol" && a.kind !== "lyric" && a.kind !== "rehearsal-mark" && a.kind !== "tempo-mark"
      );
      m.navigation = undefined;
      m.barlineEnd = "single";

      const idMap = new Map<NoteEventId, NoteEventId>();
      for (const voice of m.voices) {
        voice.id = newId<VoiceId>("vce");
        if (targetStaves < 2) {
          voice.staff = undefined;
        }
        for (const event of voice.events) {
          const oldId = event.id;
          event.id = newId<NoteEventId>("evt");
          idMap.set(oldId, event.id);
          if (targetStaves < 2 && "renderStaff" in event) {
            delete (event as any).renderStaff;
          }
        }
      }
      // Update annotation references to new event IDs
      for (const ann of m.annotations) {
        if ("noteEventId" in ann && ann.noteEventId) {
          const newEvtId = idMap.get(ann.noteEventId as NoteEventId);
          if (newEvtId) (ann as any).noteEventId = newEvtId;
        }
        if ("startEventId" in ann && ann.startEventId) {
          const newId2 = idMap.get(ann.startEventId as NoteEventId);
          if (newId2) (ann as any).startEventId = newId2;
        }
        if ("endEventId" in ann && ann.endEventId) {
          const newId2 = idMap.get(ann.endEventId as NoteEventId);
          if (newId2) (ann as any).endEventId = newId2;
        }
      }
      return m;
    });

    const startIndex = cursor.measureIndex;
    // Ensure enough measures exist to paste into
    while (part.measures.length < startIndex + measuresToInsert.length) {
      const refM = part.measures[part.measures.length - 1] ?? refMeasure;
      const newMeasure = factory.measure(
        Array.from({ length: refM?.voices.length ?? 1 }, () => factory.voice([factory.rest({ type: "whole", dots: 0 })]))
      );
      if (refM) {
        newMeasure.clef = { ...refM.clef };
        newMeasure.keySignature = { ...refM.keySignature };
        newMeasure.timeSignature = { ...refM.timeSignature };
      }
      part.measures.push(newMeasure);
      // Add matching measures to other parts
      for (let pi = 0; pi < score.parts.length; pi++) {
        if (pi === cursor.partIndex) continue;
        const otherPart = score.parts[pi];
        const otherRef = otherPart.measures[otherPart.measures.length - 1];
        const otherMeasure = factory.measure(
          Array.from({ length: otherRef?.voices.length ?? 1 }, () => factory.voice([factory.rest({ type: "whole", dots: 0 })]))
        );
        if (otherRef) {
          otherMeasure.clef = { ...otherRef.clef };
          otherMeasure.keySignature = { ...otherRef.keySignature };
          otherMeasure.timeSignature = { ...otherRef.timeSignature };
        }
        otherPart.measures.push(otherMeasure);
      }
    }
    for (let i = 0; i < measuresToInsert.length; i++) {
      const targetIdx = startIndex + i;
      part.measures[targetIdx].voices = measuresToInsert[i].voices;
      const pastedAnnotations = measuresToInsert[i].annotations;
      if (pastedAnnotations.length > 0) {
        const existing = part.measures[targetIdx].annotations;
        part.measures[targetIdx].annotations = [...existing, ...pastedAnnotations];
      }
    }

    const lastPasted = Math.min(startIndex + measuresToInsert.length - 1, part.measures.length - 1);
    set({
      score,
      inputState: { ...state.inputState, cursor: { ...cursor, measureIndex: lastPasted, eventIndex: 0 } },
      selection: null,
    });
  },

  setCursorDirect(cursor, tabInputActive?: boolean) {
    set((s) => ({
      inputState: {
        ...s.inputState,
        cursor,
        tabInputActive: tabInputActive ?? s.inputState.tabInputActive,
        // Reset tab fret buffer when switching staves
        tabFretBuffer: tabInputActive !== undefined && tabInputActive !== s.inputState.tabInputActive ? "" : s.inputState.tabFretBuffer,
      },
    }));
  },


  setTitle(title) {
    const state = get();
    const cmd = new SetScoreMeta("title", title);
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState });
  },

  setComposer(composer) {
    const state = get();
    const cmd = new SetScoreMeta("composer", composer);
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState });
  },

  undo() {
    const state = get();
    const result = history.undo({
      score: state.score,
      inputState: state.inputState,
    });
    if (result) {
      // Restore score + cursor, but keep current toolbar state
      set({
        score: result.score,
        inputState: { ...state.inputState, cursor: result.inputState.cursor },
        lastEnteredPosition: null,
      });
    }
  },

  redo() {
    const state = get();
    const result = history.redo({
      score: state.score,
      inputState: state.inputState,
    });
    if (result) {
      set({
        score: result.score,
        inputState: { ...state.inputState, cursor: result.inputState.cursor },
        lastEnteredPosition: null,
      });
    }
  },

  // Phase 2 actions

  toggleArticulation(kind) {
    const state = get();

    // Mutually exclusive groups — adding one removes others in the same group
    const EXCLUSION_GROUPS: string[][] = [
      ["bend", "pre-bend", "bend-release"],
      ["slide-in-below", "slide-in-above"],
      ["slide-out-below", "slide-out-above", "slide-up", "slide-down"],
      ["down-bow", "up-bow"],
      ["down-stroke", "up-stroke", "fingerpick-p", "fingerpick-i", "fingerpick-m", "fingerpick-a"],
      ["hammer-on", "pull-off"],
      ["staccato", "staccatissimo"],       // tenuto can coexist (portato)
      ["accent", "marcato"],               // marcato implies accent
      ["harmonic", "palm-mute", "tapping"],
    ];
    // Dead note is incompatible with all of these, but they don't exclude each other
    const DEAD_NOTE_INCOMPATIBLE = new Set([
      "bend", "pre-bend", "bend-release", "harmonic",
      "slide-up", "slide-down", "slide-in-below", "slide-in-above",
      "slide-out-below", "slide-out-above", "hammer-on", "pull-off",
      "trill", "vibrato", "let-ring",
    ]);
    const excluded = new Set<string>();
    for (const group of EXCLUSION_GROUPS) {
      if (group.includes(kind)) {
        for (const k of group) if (k !== kind) excluded.add(k);
      }
    }
    if (kind === "dead-note") {
      for (const k of DEAD_NOTE_INCOMPATIBLE) excluded.add(k);
    } else if (DEAD_NOTE_INCOMPATIBLE.has(kind)) {
      excluded.add("dead-note");
    }

    // Helper to toggle articulation on a single event
    const SEMITONE_ARTS = new Set(["bend", "pre-bend", "bend-release"]);
    const BEND_CYCLE = [1, 2, 3]; // half, full, 1½
    const toggleArt = (ev: import("../model/note").NoteEvent, nextEv?: import("../model/note").NoteEvent): import("../model/note").NoteEvent => {
      if (ev.kind === "rest" || ev.kind === "slash") return ev;

      // Hammer-on/pull-off: block if next note is on a different string
      if ((kind === "hammer-on" || kind === "pull-off") && nextEv) {
        const curS = getString(ev);
        const nextS = getString(nextEv);
        if (curS != null && nextS != null && curS !== nextS) return ev;
      }

      const arts = ev.articulations ?? [];
      const filtered = arts.filter((a) => a.kind !== kind && !excluded.has(a.kind));

      if (SEMITONE_ARTS.has(kind)) {
        const existing = arts.find((a) => a.kind === kind);
        if (existing && "semitones" in existing) {
          const curIdx = BEND_CYCLE.indexOf(existing.semitones);
          const nextIdx = curIdx + 1;
          if (nextIdx < BEND_CYCLE.length) {
            filtered.push({ kind, semitones: BEND_CYCLE[nextIdx] } as import("../model/note").Articulation);
          }
        } else {
          filtered.push({ kind, semitones: 1 } as import("../model/note").Articulation);
        }
      } else {
        const has = arts.some((a) => a.kind === kind);
        if (!has) {
          filtered.push({ kind } as import("../model/note").Articulation);
        }
      }

      return { ...ev, articulations: filtered.length > 0 ? filtered : undefined };
    };

    // Cross-note checks
    const SLIDE_CONNECTIONS = new Set(["slide-up", "slide-down"]);
    const SLIDE_INS = new Set(["slide-in-below", "slide-in-above"]);
    const SLIDE_OUTS = new Set(["slide-out-below", "slide-out-above"]);

    // Hammer-on/pull-off string check helper
    const { partIndex: togglePartIdx } = state.inputState.cursor;
    const partTuning = state.score.parts[togglePartIdx]?.tuning ?? STANDARD_TUNING;
    const getString = (ev: import("../model/note").NoteEvent) => {
      if (ev.kind === "note") return ev.tabInfo?.string ?? ev.head.tabInfo?.string ?? pitchToTab(ev.head.pitch, partTuning).string;
      if (ev.kind === "chord") return ev.tabInfo?.string ?? ev.heads[0]?.tabInfo?.string ?? pitchToTab(ev.heads[0].pitch, partTuning).string;
      return undefined;
    };

    const stripNeighborSlides = (voice: import("../model/score").Voice, idx: number) => {
      const prev = idx > 0 ? voice.events[idx - 1] : undefined;
      const next = idx < voice.events.length - 1 ? voice.events[idx + 1] : undefined;
      const strip = (ev: import("../model/note").NoteEvent | undefined, kinds: Set<string>) => {
        if (!ev || ev.kind === "rest" || ev.kind === "slash" || !ev.articulations) return;
        ev.articulations = ev.articulations.filter((a) => !kinds.has(a.kind));
        if (ev.articulations.length === 0) ev.articulations = undefined;
      };
      if (SLIDE_CONNECTIONS.has(kind)) {
        strip(next, SLIDE_INS);
        strip(prev, SLIDE_OUTS);
      }
      if (SLIDE_INS.has(kind)) strip(prev, SLIDE_CONNECTIONS);
      // No cross-note cleanup for slide-out — only affects current note via same-note exclusion
    };

    // Note-level selection
    if (state.noteSelection) {
      const ns = state.noteSelection;
      const score = structuredClone(state.score);
      for (let mi = ns.startMeasure; mi <= ns.endMeasure; mi++) {
        const voice = score.parts[ns.partIndex]?.measures[mi]?.voices[ns.voiceIndex];
        if (!voice) continue;
        const startIdx = mi === ns.startMeasure ? ns.startEvent : 0;
        const endIdx = mi === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
        for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
          voice.events[i] = toggleArt(voice.events[i], voice.events[i + 1]);
          stripNeighborSlides(voice, i);
        }
      }
      set({ score });
      return;
    }

    // Bar-level selection
    if (state.selection && !state.inputState.stepEntry) {
      const { partIndex, measureStart, measureEnd } = state.selection;
      const score = structuredClone(state.score);
      const part = score.parts[partIndex];
      if (part) {
        for (let mi = measureStart; mi <= measureEnd; mi++) {
          const measure = part.measures[mi];
          if (!measure) continue;
          for (const voice of measure.voices) {
            voice.events = voice.events.map((ev, idx) => {
              const result = toggleArt(ev, voice.events[idx + 1]);
              voice.events[idx] = result; // update in-place for neighbor checks
              stripNeighborSlides(voice, idx);
              return voice.events[idx];
            });
          }
        }
        set({ score });
      }
      return;
    }

    // Single note at cursor
    const cmd = new ToggleArticulation(kind);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({ score: result.score, inputState: result.inputState });
  },

  toggleCrossStaff() {
    const state = get();

    // Helper to toggle cross-staff on a single event
    const toggleCS = (ev: import("../model/note").NoteEvent, voiceStaff: number): import("../model/note").NoteEvent => {
      if (ev.kind === "rest" || ev.kind === "slash") return ev;
      const otherStaff = voiceStaff === 0 ? 1 : 0;
      if (isCrossStaff(ev, voiceStaff)) {
        const copy = { ...ev };
        delete (copy as { renderStaff?: number }).renderStaff;
        return copy;
      }
      return { ...ev, renderStaff: otherStaff };
    };

    // Check instrument supports grand staff
    const partIndex = state.noteSelection?.partIndex ?? state.selection?.partIndex ?? state.inputState.cursor.partIndex;
    const part = state.score.parts[partIndex];
    if (!part) return;
    const instrument = getInstrument(part.instrumentId);
    if (!instrument || instrument.staves < 2) return;

    // Note-level selection
    if (state.noteSelection) {
      const ns = state.noteSelection;
      const score = structuredClone(state.score);
      for (let mi = ns.startMeasure; mi <= ns.endMeasure; mi++) {
        const voice = score.parts[ns.partIndex]?.measures[mi]?.voices[ns.voiceIndex];
        if (!voice) continue;
        const voiceStaff = voice.staff ?? 0;
        const startIdx = mi === ns.startMeasure ? ns.startEvent : 0;
        const endIdx = mi === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
        for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
          voice.events[i] = toggleCS(voice.events[i], voiceStaff);
        }
      }
      set({ score });
      return;
    }

    // Bar-level selection
    if (state.selection && !state.inputState.stepEntry) {
      const { partIndex: pi, measureStart, measureEnd } = state.selection;
      const score = structuredClone(state.score);
      const p = score.parts[pi];
      if (p) {
        for (let mi = measureStart; mi <= measureEnd; mi++) {
          const measure = p.measures[mi];
          if (!measure) continue;
          for (const voice of measure.voices) {
            const voiceStaff = voice.staff ?? 0;
            voice.events = voice.events.map((ev) => toggleCS(ev, voiceStaff));
          }
        }
        set({ score });
      }
      return;
    }

    // Single note at cursor
    const cmd = new ToggleCrossStaff();
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({ score: result.score, inputState: result.inputState });
  },

  changePitch(pitchClass: PitchClass) {
    const state = get();
    const { cursor } = state.inputState;
    const measure = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
    const fifths = measure?.keySignature?.fifths ?? 0;
    const acc = state.inputState.accidentalExplicit
      ? state.inputState.accidental
      : keyAccidental(pitchClass, fifths);
    const cmd = new ChangePitch(
      pitchClass,
      state.inputState.octave as Octave,
      acc
    );
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },


  setVoice(n: number) {
    set((s) => {
      const score = structuredClone(s.score);
      const cursor = { ...s.inputState.cursor };
      const { partIndex, measureIndex } = cursor;
      const staveIndex = cursor.staveIndex ?? 0;

      const measure = score.parts[partIndex]?.measures[measureIndex];
      if (!measure) return s;

      // Find existing voices on this staff
      const staffVoices = measure.voices
        .map((v, i) => ({ voice: v, flatIndex: i }))
        .filter((e) => (e.voice.staff ?? 0) === staveIndex);

      if (n < staffVoices.length) {
        // Voice already exists on this staff
        cursor.voiceIndex = staffVoices[n].flatIndex;
      } else {
        // Create new voices on this staff up to the requested index
        let flatIndex = cursor.voiceIndex;
        for (let i = staffVoices.length; i <= n; i++) {
          flatIndex = measure.voices.length;
          measure.voices.push({
            id: newId<VoiceId>("vce"),
            events: [],
            staff: staveIndex,
          });
        }
        cursor.voiceIndex = flatIndex;
      }
      cursor.eventIndex = 0;

      return {
        score,
        inputState: {
          ...s.inputState,
          voice: n,
          cursor,
        },
      };
    });
  },

  insertMeasure() {
    const state = get();
    const cmd = new InsertMeasure();
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  deleteMeasure() {
    const state = get();
    const cmd = new DeleteMeasure();
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  changeTimeSig(timeSig: TimeSignature) {
    const state = get();
    const cmd = new ChangeTimeSig(timeSig);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  changeKeySig(keySig: KeySignature) {
    const state = get();
    const cmd = new ChangeKeySig(keySig);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  changeClef(clef: Clef) {
    const state = get();
    const cmd = new ChangeClef(clef);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  // Phase 3 actions

  enterChordMode() {
    set((s) => ({
      inputState: {
        ...s.inputState,
        textInputMode: "chord",
        textInputBuffer: "",
        textInputInitialValue: "",
      },
    }));
  },

  enterLyricMode() {
    const s = get();
    const { partIndex, measureIndex, voiceIndex, eventIndex } = s.inputState.cursor;
    const measure = s.score.parts[partIndex]?.measures[measureIndex];
    const event = measure?.voices[voiceIndex]?.events[eventIndex];
    const existing = event && measure?.annotations.find(
      (a) => a.kind === "lyric" && a.noteEventId === event.id && a.verseNumber === 1
    );
    set({
      inputState: {
        ...s.inputState,
        textInputMode: "lyric",
        textInputBuffer: "",
        textInputInitialValue: existing?.kind === "lyric" ? existing.text : "",
        lyricVerse: 1,
      },
    });
  },

  editAnnotation(box: AnnotationBox) {
    // Move cursor to the note this annotation belongs to, then enter edit mode with pre-populated value
    const state = get();
    const part = state.score.parts[box.partIndex];
    if (!part) return;
    const measure = part.measures[box.measureIndex];
    if (!measure) return;

    // Find the voice and event index for this noteEventId
    for (let vi = 0; vi < measure.voices.length; vi++) {
      const voice = measure.voices[vi];
      for (let ei = 0; ei < voice.events.length; ei++) {
        if (voice.events[ei].id === box.noteEventId) {
          set({
            inputState: {
              ...state.inputState,
              cursor: {
                partIndex: box.partIndex,
                measureIndex: box.measureIndex,
                voiceIndex: vi,
                eventIndex: ei,
                staveIndex: voice.staff ?? 0,
              },
              textInputMode: box.kind === "chord-symbol" ? "chord" : "lyric",
              textInputBuffer: "",
              textInputInitialValue: box.text,
            },
          });
          return;
        }
      }
    }
  },

  commitTextInput(text: string) {
    const state = get();
    const { textInputMode } = state.inputState;
    if (!textInputMode) {
      set((s) => ({
        inputState: {
          ...s.inputState,
          textInputMode: null,
          textInputBuffer: "",
          textInputInitialValue: "",
        },
      }));
      return;
    }

    if (textInputMode === "chord") {
      // Calculate beat offset from cursor position
      const { partIndex, measureIndex, voiceIndex, eventIndex } = state.inputState.cursor;
      const voice =
        state.score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
      let beatOffset = 0;
      if (voice) {
        for (let i = 0; i < eventIndex && i < voice.events.length; i++) {
          beatOffset += durationToTicksFn(voice.events[i].duration, voice.events[i].tuplet);
        }
      }
      const event = voice?.events[eventIndex];
      if (!event) return;
      const cmd = new SetChordSymbol(text, beatOffset, event.id);
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({
        score: result.score,
        inputState: {
          ...result.inputState,
          textInputMode: null,
          textInputBuffer: "",
          textInputInitialValue: "",
        },
      });
    } else if (textInputMode === "lyric") {
      // Parse syllable: "hel-" means begin, "-lo" means end, "-mid-" means middle
      let syllableType: "begin" | "middle" | "end" | "single" = "single";
      let cleanText = text;
      const startsDash = text.startsWith("-");
      const endsDash = text.endsWith("-");
      if (startsDash && endsDash) {
        syllableType = "middle";
        cleanText = text.slice(1, -1);
      } else if (endsDash) {
        syllableType = "begin";
        cleanText = text.slice(0, -1);
      } else if (startsDash) {
        syllableType = "end";
        cleanText = text.slice(1);
      }

      const cmd = new SetLyric(cleanText, syllableType, state.inputState.lyricVerse);
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      // Pre-populate if the next note already has a lyric at this verse
      const nextCursor = result.inputState.cursor;
      const nextMeasure = result.score.parts[nextCursor.partIndex]?.measures[nextCursor.measureIndex];
      const nextEvent = nextMeasure?.voices[nextCursor.voiceIndex]?.events[nextCursor.eventIndex];
      const existingLyric = nextEvent && nextMeasure?.annotations.find(
        (a) => a.kind === "lyric" && a.noteEventId === nextEvent.id && a.verseNumber === state.inputState.lyricVerse
      );

      set({
        score: result.score,
        inputState: {
          ...result.inputState,
          textInputMode: "lyric",
          textInputBuffer: "",
          textInputInitialValue: existingLyric?.kind === "lyric" ? existingLyric.text : "",
        },
      });
    }
  },

  cancelTextInput() {
    set((s) => ({
      inputState: {
        ...s.inputState,
        textInputMode: null,
        textInputBuffer: "",
        textInputInitialValue: "",
      },
    }));
  },

  setLyricVerse(verse: number) {
    const s = get();
    const v = Math.max(1, verse);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = s.inputState.cursor;
    const measure = s.score.parts[partIndex]?.measures[measureIndex];
    const event = measure?.voices[voiceIndex]?.events[eventIndex];
    const existing = event && measure?.annotations.find(
      (a) => a.kind === "lyric" && a.noteEventId === event.id && a.verseNumber === v
    );
    set({
      inputState: {
        ...s.inputState,
        lyricVerse: v,
        textInputBuffer: "",
        textInputInitialValue: existing?.kind === "lyric" ? existing.text : "",
      },
    });
  },

  // Phase 4: Playback

  async play() {
    const service = getGlobalPluginManager()?.getPlaybackService();
    if (!service) return;
    const state = get();
    service.setCallbacks({
      onTick: (tick: number) => {
        set({ playbackTick: tick });
      },
      onStateChange: (transportState) => {
        set({
          isPlaying: transportState === "playing",
          playbackTick: transportState === "stopped" ? null : get().playbackTick,
        });
      },
    });
    service.setMetronome(state.metronomeOn);
    service.setCountIn(state.countInOn);

    // If there's a selection, play only the selected measures (looping)
    const sel = state.selection;
    const noteSel = state.noteSelection;
    const { cursor } = state.inputState;
    const part = state.score.parts[cursor.partIndex];

    let startTick = 0;
    let measureRange: { start: number; end: number } | undefined;

    if (sel) {
      measureRange = { start: sel.measureStart, end: sel.measureEnd };
    } else if (noteSel) {
      measureRange = { start: noteSel.startMeasure, end: noteSel.endMeasure };
    } else if (part) {
      // Play from cursor position
      for (let mi = 0; mi < cursor.measureIndex && mi < part.measures.length; mi++) {
        const ts = part.measures[mi].timeSignature;
        startTick += (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;
      }
      const voice = part.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      if (voice) {
        for (let ei = 0; ei < cursor.eventIndex && ei < voice.events.length; ei++) {
          startTick += durationToTicksFn(voice.events[ei].duration, voice.events[ei].tuplet);
        }
      }
    }

    await service.play(state.score, startTick, measureRange);
    set({ isPlaying: true });
  },

  pause() {
    const service = getGlobalPluginManager()?.getPlaybackService();
    if (!service) return;
    service.pause();
    set({ isPlaying: false, playbackTick: null });
  },

  stopPlayback() {
    const service = getGlobalPluginManager()?.getPlaybackService();
    if (!service) return;
    service.stop();
    // Return cursor to beginning
    const state = get();
    set({
      isPlaying: false,
      playbackTick: null,
      inputState: {
        ...state.inputState,
        cursor: { ...state.inputState.cursor, measureIndex: 0, eventIndex: 0 },
      },
    });
  },

  setTempo(bpm: number) {
    getGlobalPluginManager()?.getPlaybackService()?.setTempo(bpm);
    set((s) => {
      const score = { ...s.score, tempo: bpm };
      return { score, tempo: bpm };
    });
  },

  setSwing(swing: import("../model/annotations").SwingSettings | undefined) {
    const state = get();
    const cmd = new SetSwing(swing);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({ score: result.score, inputState: result.inputState });
  },

  setPlaybackTick(tick: number | null) {
    set({ playbackTick: tick });
  },

  toggleMetronome() {
    set((s) => {
      const next = !s.metronomeOn;
      getGlobalPluginManager()?.getPlaybackService()?.setMetronome(next);
      return { metronomeOn: next };
    });
  },

  toggleCountIn() {
    set((s) => {
      const next = !s.countInOn;
      getGlobalPluginManager()?.getPlaybackService()?.setCountIn(next);
      return { countInOn: next };
    });
  },

  // Phase 5: Multi-track/Part management

  addPart(instrumentId: string) {
    const state = get();
    const cmd = new AddPart(instrumentId);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  removePart(partIndex: number) {
    const state = get();
    const cmd = new RemovePart(partIndex);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    // Clean up hiddenParts: remove the deleted index, shift higher indices down
    const hidden = new Set<number>();
    for (const i of state.hiddenParts) {
      if (i < partIndex) hidden.add(i);
      else if (i > partIndex) hidden.add(i - 1);
    }
    set({
      score: result.score,
      inputState: result.inputState,
      hiddenParts: hidden,
    });
  },

  reorderPart(partIndex: number, direction: "up" | "down") {
    const state = get();
    const cmd = new ReorderParts(partIndex, direction);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  toggleSolo(partIndex: number) {
    const state = get();
    const part = state.score.parts[partIndex];
    if (!part) return;
    const cmd = new SetPartProperty(partIndex, { field: "solo", value: !part.solo });
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    // Update playback reference so solo takes effect during playback
    getGlobalPluginManager()?.getPlaybackService()?.updateScore(result.score);
    set({ score: result.score, inputState: result.inputState });
  },

  toggleMute(partIndex: number) {
    const state = get();
    const part = state.score.parts[partIndex];
    if (!part) return;
    const cmd = new SetPartProperty(partIndex, { field: "muted", value: !part.muted });
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    // Update playback reference so mute takes effect during playback
    getGlobalPluginManager()?.getPlaybackService()?.updateScore(result.score);
    set({ score: result.score, inputState: result.inputState });
  },

  setPartTuning(partIndex: number, tuning: import("../model/guitar").Tuning | undefined) {
    const state = get();
    const cmd = new SetPartProperty(partIndex, { field: "tuning", value: tuning });
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState });
  },

  setPartCapo(partIndex: number, capo: number) {
    const state = get();
    const cmd = new SetPartProperty(partIndex, { field: "capo", value: capo });
    const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
    set({ score: result.score, inputState: result.inputState });
  },

  togglePartVisibility(partIndex: number) {
    set((s) => {
      const hidden = new Set(s.hiddenParts);
      if (hidden.has(partIndex)) {
        hidden.delete(partIndex);
      } else {
        // Don't hide the last visible part
        const visibleCount = s.score.parts.length - hidden.size;
        if (visibleCount <= 1) return s;
        hidden.add(partIndex);
      }
      return { hiddenParts: hidden };
    });
  },

  moveCursorToPart(partIndex: number) {
    set((s) => {
      if (partIndex < 0 || partIndex >= s.score.parts.length) return s;
      const cursor = { ...s.inputState.cursor };
      cursor.partIndex = partIndex;
      cursor.eventIndex = 0;
      cursor.voiceIndex = 0;
      cursor.staveIndex = 0;
      return { inputState: { ...s.inputState, cursor } };
    });
  },

  moveCursorPart(direction: "up" | "down") {
    set((s) => {
      const cursor = { ...s.inputState.cursor };
      const part = s.score.parts[cursor.partIndex];
      const instrument = part ? getInstrument(part.instrumentId) : undefined;
      const staveCount = instrument?.staves ?? 1;
      const currentStave = cursor.staveIndex ?? 0;

      // Grand staff: navigate between staves before moving to another part
      if (staveCount >= 2) {
        if (direction === "down" && currentStave === 0) {
          const score = structuredClone(s.score);
          const measure = score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
          if (measure) {
            cursor.staveIndex = 1;
            cursor.voiceIndex = findOrCreateVoiceForStaff(measure, 1, 0);
            cursor.eventIndex = 0;
            return { score, inputState: { ...s.inputState, voice: 0, cursor } };
          }
        }
        if (direction === "up" && currentStave >= 1) {
          cursor.staveIndex = 0;
          cursor.voiceIndex = 0; // Voice 0 is always on staff 0
          cursor.eventIndex = 0;
          return { inputState: { ...s.inputState, voice: 0, cursor } };
        }
      }

      // Move to adjacent part
      const newPartIndex =
        direction === "up" ? cursor.partIndex - 1 : cursor.partIndex + 1;
      if (newPartIndex < 0 || newPartIndex >= s.score.parts.length) return s;
      cursor.partIndex = newPartIndex;
      cursor.eventIndex = 0;
      cursor.voiceIndex = 0;

      // When moving up, land on the bottom staff of the target part
      if (direction === "up") {
        const targetPart = s.score.parts[newPartIndex];
        const targetInstrument = targetPart ? getInstrument(targetPart.instrumentId) : undefined;
        cursor.staveIndex = (targetInstrument?.staves ?? 1) >= 2 ? 1 : 0;
      } else {
        cursor.staveIndex = 0;
      }

      return { inputState: { ...s.inputState, voice: 0, cursor } };
    });
  },

  // Phase 9: View modes (notation display toggles)

  toggleNotation(type: "standard" | "tab" | "slash", partIndex?: number) {
    set((s) => {
      const newDisplay = { ...s.viewConfig.notationDisplay };
      // If no partIndex, toggle for the current cursor part
      const pi = partIndex ?? s.inputState.cursor.partIndex;
      const current = getPartDisplay(s.viewConfig, pi);
      const toggled = !current[type];
      const updated = { ...current, [type]: toggled };
      // Ensure at least one notation type remains on
      if (!updated.standard && !updated.tab && !updated.slash) return {};
      newDisplay[pi] = updated;
      return { viewConfig: { ...s.viewConfig, notationDisplay: newDisplay } };
    });
  },

  setPartNotation(partIndex: number, display: Partial<NotationDisplay>) {
    set((s) => {
      const current = getPartDisplay(s.viewConfig, partIndex);
      const newDisplay = { ...s.viewConfig.notationDisplay };
      newDisplay[partIndex] = { ...current, ...display };
      return { viewConfig: { ...s.viewConfig, notationDisplay: newDisplay } };
    });
  },

  // Phase 10: Navigation marks

  setRepeatBarline(barlineType: BarlineType) {
    const state = get();
    const cmd = new SetRepeatBarline(barlineType);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  setVolta(volta: Volta | null) {
    const state = get();
    const cmd = new SetVolta(volta);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

  setNavigationMark(markType: NavigationMarkType, value?: string | boolean) {
    const state = get();
    const cmd = new SetNavigationMark(markType, value);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
    });
  },

}));

// --- Auto-save: debounced save to localStorage + Tauri app data dir ---

import { saveSnapshot } from "../fileio/history";

const RECOVERY_FILENAME = "recovery.json";

async function getTauriRecoveryPath(): Promise<{ fs: any; path: string } | null> {
  try {
    const [fs, pathMod] = await Promise.all([
      import("@tauri-apps/plugin-fs"),
      import("@tauri-apps/api/path"),
    ]);
    const dataDir = await pathMod.appDataDir();
    await fs.mkdir(`${dataDir}recovery`, { recursive: true });
    return { fs, path: `${dataDir}recovery/${RECOVERY_FILENAME}` };
  } catch {
    return null;
  }
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

async function autoSave(score: Score, filePath: string | null): Promise<void> {
  try {
    const serialized = serializeScore(score);
    const viewConfig = useEditorStore.getState().viewConfig;
    const hiddenParts = [...useEditorStore.getState().hiddenParts];
    const payload = JSON.stringify({ score: serialized, filePath, viewConfig, hiddenParts, savedAt: Date.now() });

    // Try Tauri app data dir first, fall back to localStorage
    const tauri = await getTauriRecoveryPath();
    if (tauri) {
      await tauri.fs.writeTextFile(tauri.path, payload);
    } else {
      localStorage.setItem(AUTOSAVE_KEY, payload);
    }

    // Save a snapshot to file history
    saveSnapshot(serialized, score.title || "Untitled");
  } catch {
    // ignore storage errors
  }
}

// Subscribe to score/viewConfig changes: mark dirty + debounce auto-save
useEditorStore.subscribe((state, prevState) => {
  if (state.score !== prevState.score) {
    const dirty = state.cleanScoreJson ? serializeScore(state.score) !== state.cleanScoreJson : true;
    if (dirty !== state.isDirty) useEditorStore.setState({ isDirty: dirty });
  }
  if (state.score !== prevState.score || state.viewConfig !== prevState.viewConfig || state.hiddenParts !== prevState.hiddenParts) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      autoSave(state.score, state.filePath);
    }, AUTOSAVE_DEBOUNCE_MS);
  }
});

// Persist UI preferences to settings when they change
import { updateSettings, getSettings as loadSettings } from "../settings";

let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
useEditorStore.subscribe((state, prevState) => {
  if (
    state.metronomeOn !== prevState.metronomeOn ||
    state.countInOn !== prevState.countInOn
  ) {
    if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(() => {
      updateSettings({
        metronomeEnabled: state.metronomeOn,
        countInEnabled: state.countInOn,
      });
    }, 500);
  }
});

// --- Restore from Tauri app data dir or localStorage on init ---

async function restoreAutoSave(): Promise<void> {
  try {
    // Try Tauri first
    const tauri = await getTauriRecoveryPath();
    let raw: string | null = null;
    if (tauri) {
      try {
        raw = await tauri.fs.readTextFile(tauri.path);
      } catch {
        // no recovery file yet
      }
    }
    // Fall back to localStorage (browser or first run)
    if (!raw) raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.score === "string") {
      const score = deserializeScore(parsed.score);
      useEditorStore.setState({
        score,
        filePath: parsed.filePath ?? parsed.importSource ?? null,
        cleanScoreJson: parsed.score,
        ...(parsed.viewConfig ? { viewConfig: parsed.viewConfig } : {}),
        ...(parsed.hiddenParts ? { hiddenParts: new Set(parsed.hiddenParts) } : {}),
      });
    }
  } catch {
    // ignore corrupt auto-save data
  }
}

function restoreUiPreferences(): void {
  try {
    const settings = loadSettings();
    useEditorStore.setState({
      metronomeOn: settings.metronomeEnabled ?? false,
      countInOn: settings.countInEnabled ?? false,
    });
  } catch {
    // ignore
  }
}

restoreAutoSave();
restoreUiPreferences();
if (typeof window !== "undefined") (window as any).__editorStore = useEditorStore;

