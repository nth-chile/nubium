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
import type { ViewModeType } from "../views/ViewMode";
import { getDefaultViewConfig, type ViewConfig } from "../views/ViewMode";
import { DURATION_TYPES_ORDERED } from "../model";
import { durationToTicks as durationToTicksFn } from "../model/duration";
import { factory } from "../model";
import { defaultInputState, type InputState, type CursorPosition } from "../input/InputState";
import { CommandHistory } from "../commands/CommandHistory";
import type { Selection, NoteSelection } from "../plugins/PluginAPI";
import { InsertNote } from "../commands/InsertNote";
import { InsertRest } from "../commands/InsertRest";
import { DeleteNote } from "../commands/DeleteNote";
import { ChangePitch } from "../commands/ChangePitch";
import { ChangeDuration } from "../commands/ChangeDuration";
import { InsertMeasure } from "../commands/InsertMeasure";
import { DeleteMeasure } from "../commands/DeleteMeasure";
import { ChangeTimeSig } from "../commands/ChangeTimeSig";
import { ChangeKeySig } from "../commands/ChangeKeySig";
import { ChangeClef } from "../commands/ChangeClef";
import { SetChordSymbol } from "../commands/SetChordSymbol";
import { SetLyric } from "../commands/SetLyric";
import { SetRehearsalMark } from "../commands/SetRehearsalMark";
import { SetTempo } from "../commands/SetTempo";
import { AddPart } from "../commands/AddPart";
import { RemovePart } from "../commands/RemovePart";
import { ReorderParts } from "../commands/ReorderParts";
import { SetRepeatBarline } from "../commands/SetRepeatBarline";
import { SetVolta } from "../commands/SetVolta";
import { SetNavigationMark } from "../commands/SetNavigationMark";
import { ToggleArticulation } from "../commands/ToggleArticulation";
import { SetDynamic } from "../commands/SetDynamic";
import { TogglePickup } from "../commands/TogglePickup";
import { SetSlur } from "../commands/SetSlur";
import { InsertGraceNote } from "../commands/InsertGraceNote";
import { OverwriteNote } from "../commands/OverwriteNote";
import type { NavigationMarkType } from "../commands/SetNavigationMark";
import type { BarlineType, Volta } from "../model";
import type { NoteBox, AnnotationBox } from "../renderer/vexBridge";
import { newId, type VoiceId, type MeasureId } from "../model/ids";
import * as Transport from "../playback/TonePlayback";

const history = new CommandHistory();

const AUTOSAVE_KEY = "notation-autosave";
const AUTOSAVE_DEBOUNCE_MS = 2000;

interface EditorStore {
  // Document
  score: Score;
  filePath: string | null;
  autoSaveStatus: string | null;

  // Input
  inputState: InputState;

  // Rendering
  noteBoxes: Map<NoteEventId, NoteBox>;
  annotationBoxes: AnnotationBox[];
  measurePositions: { partIndex: number; measureIndex: number; x: number; y: number; width: number; height: number }[];
  titlePositions: { title?: { x: number; y: number; width: number; height: number }; composer?: { x: number; y: number; width: number; height: number } };
  editingTitle: boolean;
  editingComposer: boolean;
  selection: Selection | null;
  noteSelection: NoteSelection | null;
  clipboardMeasures: Measure[] | null;

  // Actions
  insertNote(pitchClass: PitchClass): void;
  insertRest(): void;
  deleteNote(): void;
  setDuration(type: DurationType): void;
  toggleDot(): void;
  setAccidental(acc: Accidental): void;
  toggleStepEntry(): void;
  moveCursor(direction: "left" | "right"): void;
  moveCursorToMeasure(direction: "next" | "prev"): void;
  changeOctave(direction: "up" | "down"): void;
  setScore(score: Score): void;
  setFilePath(path: string | null): void;
  setAutoSaveStatus(status: string | null): void;
  setNoteBoxes(boxes: Map<NoteEventId, NoteBox>): void;
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
  pasteAtCursor(): void;
  setCursorDirect(cursor: CursorPosition): void;
  setTitle(title: string): void;
  setComposer(composer: string): void;
  undo(): void;
  redo(): void;

  // Articulations
  toggleArticulation(kind: import("../model/note").ArticulationKind): void;

  // Phase 2 actions
  changePitch(pitchClass: PitchClass): void;
  changeDuration(type: DurationType): void;
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

  // Phase 4: Playback
  isPlaying: boolean;
  playbackTick: number | null;
  tempo: number;
  metronomeOn: boolean;
  play(): void;
  pause(): void;
  stopPlayback(): void;
  setTempo(bpm: number): void;
  setPlaybackTick(tick: number | null): void;
  toggleMetronome(): void;

  // Phase 5: Multi-track/Part management
  addPart(instrumentId: string): void;
  removePart(partIndex: number): void;
  reorderPart(partIndex: number, direction: "up" | "down"): void;
  toggleSolo(partIndex: number): void;
  toggleMute(partIndex: number): void;
  moveCursorToPart(partIndex: number): void;
  moveCursorPart(direction: "up" | "down"): void;

  // Phase 9: View modes
  viewMode: ViewModeType;
  viewConfig: ViewConfig;
  viewScrollPositions: Record<ViewModeType, number>;
  setViewMode(mode: ViewModeType): void;

  // Phase 10: Navigation marks
  setRepeatBarline(barlineType: BarlineType): void;
  setVolta(volta: Volta | null): void;
  setNavigationMark(markType: NavigationMarkType, value?: string | boolean): void;

  // Popovers
  popover: "dynamics" | "tempo" | "time-sig" | "key-sig" | "rehearsal" | "barline" | "go-to-measure" | null;
  setPopover(popover: EditorStore["popover"]): void;
  setDynamic(level: import("../model/annotations").DynamicLevel | null): void;
  setTempoMark(bpm: number, beatUnit?: DurationType, text?: string): void;
  setRehearsalMark(text: string): void;
  togglePickup(): void;
  toggleGraceNoteMode(): void;
  slurStartEventId: NoteEventId | null;
  toggleSlur(): void;

  // Plugin display toggles
  showTitle: boolean;
  showComposer: boolean;
  showLyrics: boolean;
  setShowTitle(show: boolean): void;
  setShowComposer(show: boolean): void;
  setShowLyrics(show: boolean): void;
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
  const offset = (CLEF_DEFAULT_OCTAVE[measure.clef.type] ?? 4) - 4;
  return Math.max(0, Math.min(9, inputOctave + offset)) as Octave;
}

/** Returns true if the cursor is on an existing event (not past the end) */
function cursorOnExistingEvent(score: Score, cursor: CursorPosition): boolean {
  const voice =
    score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  if (!voice) return false;
  return cursor.eventIndex < voice.events.length;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  score: factory.emptyScore(),
  filePath: null,
  autoSaveStatus: null,
  inputState: defaultInputState(),
  noteBoxes: new Map(),
  annotationBoxes: [],
  measurePositions: [],
  titlePositions: {},
  editingTitle: false,
  editingComposer: false,
  selection: null,
  noteSelection: null,
  clipboardMeasures: null,
  isPlaying: false,
  playbackTick: null,
  tempo: 120,
  metronomeOn: false,
  viewMode: "full-score" as ViewModeType,
  viewConfig: getDefaultViewConfig("full-score"),
  viewScrollPositions: {
    "full-score": 0,
    "lead-sheet": 0,
    "songwriter": 0,
    "tab": 0,
  },
  showTitle: true,
  showComposer: false,
  showLyrics: true,
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

  insertNote(pitchClass: PitchClass) {
    const state = get();
    const { cursor } = state.inputState;
    const octave = getEffectiveOctave(state.score, cursor, state.inputState.octave as Octave);

    // Grace note mode: insert a grace note before the current event
    if (state.inputState.graceNoteMode) {
      const cmd = new InsertGraceNote(
        pitchClass,
        octave,
        state.inputState.accidental,
      );
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
      return;
    }

    // Step entry mode: overwrite existing events with input duration
    if (state.inputState.stepEntry && cursorOnExistingEvent(state.score, cursor)) {
      const cmd = new OverwriteNote(
        pitchClass,
        octave,
        state.inputState.accidental,
        { ...state.inputState.duration },
      );
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({
        score: result.score,
        inputState: result.inputState,
      });
      return;
    }

    // If cursor is on an existing note, change pitch instead of inserting
    if (cursorOnExistingEvent(state.score, cursor)) {
      const cmd = new ChangePitch(
        pitchClass,
        octave,
        state.inputState.accidental
      );
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({
        score: result.score,
        inputState: result.inputState,
      });
      return;
    }

    const cmd = new InsertNote(
      pitchClass,
      octave,
      state.inputState.accidental,
      { ...state.inputState.duration }
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

  insertRest() {
    const state = get();
    const cmd = new InsertRest({ ...state.inputState.duration });
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({
      score: result.score,
      inputState: result.inputState,
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
    });
  },

  setDuration(type: DurationType) {
    const state = get();
    // Note-level selection: change duration of selected events
    if (state.noteSelection) {
      const ns = state.noteSelection;
      const score = structuredClone(state.score);
      const voice = score.parts[ns.partIndex]?.measures[ns.measureIndex]?.voices[ns.voiceIndex];
      if (voice) {
        for (let i = ns.startEvent; i <= ns.endEvent && i < voice.events.length; i++) {
          voice.events[i] = { ...voice.events[i], duration: { type, dots: 0 } };
        }
        set({ score });
      }
    } else if (state.selection && !state.inputState.stepEntry) {
      const { partIndex, measureStart, measureEnd } = state.selection;
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
      // Single note at cursor: change its duration
      const { cursor } = state.inputState;
      const score = structuredClone(state.score);
      const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      if (voice && cursor.eventIndex < voice.events.length) {
        voice.events[cursor.eventIndex] = { ...voice.events[cursor.eventIndex], duration: { type, dots: 0 } };
        set({ score });
      }
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

    // Apply to note at cursor if one exists
    if (cursorOnExistingEvent(state.score, cursor)) {
      const score = structuredClone(state.score);
      const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      if (voice && cursor.eventIndex < voice.events.length) {
        const evt = voice.events[cursor.eventIndex];
        evt.duration = { ...evt.duration, dots: newDots };
        set({ score });
      }
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
    const newAcc = state.inputState.accidental === acc ? "natural" : acc;

    // Apply to note at cursor if one exists
    if (cursorOnExistingEvent(state.score, cursor)) {
      const score = structuredClone(state.score);
      const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      if (voice && cursor.eventIndex < voice.events.length) {
        const evt = voice.events[cursor.eventIndex];
        if (evt.kind === "note" || evt.kind === "grace") {
          evt.head = { ...evt.head, pitch: { ...evt.head.pitch, accidental: newAcc } };
          set({ score });
        } else if (evt.kind === "chord") {
          evt.heads = evt.heads.map((h) => ({
            ...h,
            pitch: { ...h.pitch, accidental: newAcc },
          }));
          set({ score });
        }
      }
    }

    set((s) => ({
      inputState: {
        ...s.inputState,
        accidental: newAcc,
      },
    }));
  },

  toggleStepEntry() {
    set((s) => ({
      inputState: {
        ...s.inputState,
        stepEntry: !s.inputState.stepEntry,
      },
    }));
  },

  moveCursor(direction: "left" | "right") {
    set((s) => {
      const cursor = { ...s.inputState.cursor };
      const part = s.score.parts[cursor.partIndex];
      const voice = part?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      // Allow navigation even when voice doesn't exist in current measure
      const eventCount = voice?.events.length ?? 0;
      // In step entry mode, allow the append position (past last note) for inserting.
      // In navigation mode, skip the append position — jump to next measure instead.
      const allowAppend = s.inputState.stepEntry;

      if (direction === "right") {
        if (allowAppend && cursor.eventIndex < eventCount) {
          cursor.eventIndex++;
        } else if (!allowAppend && cursor.eventIndex < eventCount - 1) {
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
          // In navigation mode, land on the last note; in step entry, land on append position
          cursor.eventIndex = allowAppend ? prevCount : Math.max(0, prevCount - 1);
        }
      }

      return { inputState: { ...s.inputState, cursor } };
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

      return { inputState: { ...s.inputState, cursor } };
    });
  },

  changeOctave(direction: "up" | "down") {
    set((s) => ({
      inputState: {
        ...s.inputState,
        octave: Math.max(0, Math.min(9, s.inputState.octave + (direction === "up" ? 1 : -1))) as Octave,
      },
    }));
  },

  setScore(score: Score) {
    set({ score });
  },

  setFilePath(path: string | null) {
    set({ filePath: path });
  },

  setAutoSaveStatus(status: string | null) {
    set({ autoSaveStatus: status });
  },

  setNoteBoxes(boxes: Map<NoteEventId, NoteBox>) {
    set({ noteBoxes: boxes });
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
        measureIndex: cursor.measureIndex,
        voiceIndex: cursor.voiceIndex,
        startEvent: cursor.eventIndex,
        endEvent: cursor.eventIndex,
      },
      selection: null,
    });
  },

  extendNoteSelection(direction) {
    set((s) => {
      const { cursor } = s.inputState;
      const voice = s.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      if (!voice) return s;

      const ns = s.noteSelection ?? {
        partIndex: cursor.partIndex,
        measureIndex: cursor.measureIndex,
        voiceIndex: cursor.voiceIndex,
        startEvent: cursor.eventIndex,
        endEvent: cursor.eventIndex,
        anchorEvent: cursor.eventIndex,
      };

      const anchor = ns.anchorEvent ?? ns.startEvent;
      // The "moving end" is whichever end isn't the anchor
      let movingEnd = ns.endEvent === anchor ? ns.startEvent : ns.endEvent;

      if (direction === "right" && movingEnd < voice.events.length - 1) {
        movingEnd++;
      } else if (direction === "left" && movingEnd > 0) {
        movingEnd--;
      }

      return {
        noteSelection: {
          ...ns,
          anchorEvent: anchor,
          startEvent: Math.min(anchor, movingEnd),
          endEvent: Math.max(anchor, movingEnd),
        },
        inputState: {
          ...s.inputState,
          cursor: { ...cursor, eventIndex: movingEnd },
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
    const voice = score.parts[ns.partIndex]?.measures[ns.measureIndex]?.voices[ns.voiceIndex];
    if (!voice) return;
    voice.events.splice(ns.startEvent, ns.endEvent - ns.startEvent + 1);
    const input = structuredClone(state.inputState);
    input.cursor.eventIndex = Math.min(ns.startEvent, voice.events.length);
    set({ score, inputState: input, noteSelection: null });
  },

  extendSelection(direction: "left" | "right") {
    const state = get();
    const { cursor } = state.inputState;
    const part = state.score.parts[cursor.partIndex];
    if (!part) return;

    const sel = state.selection ?? {
      partIndex: cursor.partIndex,
      measureStart: cursor.measureIndex,
      measureEnd: cursor.measureIndex,
    };

    if (direction === "right") {
      const newEnd = Math.min(sel.measureEnd + 1, part.measures.length - 1);
      set({ selection: { ...sel, measureEnd: newEnd } });
    } else {
      const newStart = Math.max(sel.measureStart - 1, 0);
      set({ selection: { ...sel, measureStart: newStart } });
    }
  },

  deleteSelectedMeasures() {
    const state = get();
    if (!state.selection) return;
    const { partIndex, measureStart, measureEnd } = state.selection;
    const score = structuredClone(state.score);
    const part = score.parts[partIndex];
    if (!part) return;

    const count = measureEnd - measureStart + 1;
    part.measures.splice(measureStart, count);

    // Ensure at least one measure remains
    if (part.measures.length === 0) {
      part.measures.push(factory.measure([factory.voice([])]));
    }

    const newCursor = {
      ...state.inputState.cursor,
      measureIndex: Math.min(measureStart, part.measures.length - 1),
      eventIndex: 0,
    };

    set({
      score,
      selection: null,
      inputState: { ...state.inputState, cursor: newCursor },
    });
  },

  copySelection() {
    const state = get();
    if (!state.selection) return;
    const { partIndex, measureStart, measureEnd } = state.selection;
    const part = state.score.parts[partIndex];
    if (!part) return;
    const measures = part.measures.slice(measureStart, measureEnd + 1);
    // Deep clone to detach from live score
    const cloned = structuredClone(measures);
    set({ clipboardMeasures: cloned });
  },

  pasteAtCursor() {
    const state = get();
    if (!state.clipboardMeasures || state.clipboardMeasures.length === 0) return;
    const score = structuredClone(state.score);
    const { cursor } = state.inputState;
    const part = score.parts[cursor.partIndex];
    if (!part) return;

    // Deep clone clipboard and regenerate all IDs
    const measuresToInsert: Measure[] = structuredClone(state.clipboardMeasures).map((m) => {
      m.id = newId<MeasureId>("msr");
      for (const voice of m.voices) {
        voice.id = newId<VoiceId>("vce");
        for (const event of voice.events) {
          event.id = newId<NoteEventId>("evt");
        }
      }
      return m;
    });

    // Insert at the measure after the cursor
    const insertIndex = cursor.measureIndex + 1;
    part.measures.splice(insertIndex, 0, ...measuresToInsert);

    const newCursor = {
      ...cursor,
      measureIndex: insertIndex + measuresToInsert.length - 1,
      eventIndex: 0,
    };

    set({
      score,
      inputState: { ...state.inputState, cursor: newCursor },
      selection: null,
    });
  },

  setCursorDirect(cursor) {
    set((s) => ({ inputState: { ...s.inputState, cursor } }));
  },


  setTitle(title) {
    set((s) => ({ score: { ...s.score, title } }));
  },

  setComposer(composer) {
    set((s) => ({ score: { ...s.score, composer } }));
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
      });
    }
  },

  // Phase 2 actions

  toggleArticulation(kind) {
    const state = get();
    const cmd = new ToggleArticulation(kind);
    const result = history.execute(cmd, {
      score: state.score,
      inputState: state.inputState,
    });
    set({ score: result.score, inputState: result.inputState });
  },

  changePitch(pitchClass: PitchClass) {
    const state = get();
    const cmd = new ChangePitch(
      pitchClass,
      state.inputState.octave as Octave,
      state.inputState.accidental
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

  changeDuration(type: DurationType) {
    const state = get();
    const cmd = new ChangeDuration({ type, dots: state.inputState.duration.dots });
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

      const measure = score.parts[partIndex]?.measures[measureIndex];
      if (!measure) return s;

      // Auto-create voices up to the requested index
      while (measure.voices.length <= n) {
        measure.voices.push({
          id: newId<VoiceId>("vce"),
          events: [],
        });
      }

      cursor.voiceIndex = n;
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
    set((s) => ({
      inputState: {
        ...s.inputState,
        textInputMode: "lyric",
        textInputBuffer: "",
        textInputInitialValue: "",
      },
    }));
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

      const cmd = new SetLyric(cleanText, syllableType, 1);
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({
        score: result.score,
        inputState: {
          ...result.inputState,
          textInputMode: "lyric",
          textInputBuffer: "",
          textInputInitialValue: "",
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

  // Phase 4: Playback

  play() {
    const state = get();
    Transport.setCallbacks({
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
    Transport.setMetronome(state.metronomeOn);
    Transport.play(state.score);
    set({ isPlaying: true });
  },

  pause() {
    Transport.pause();
    set({ isPlaying: false });
  },

  stopPlayback() {
    Transport.stop();
    set({ isPlaying: false, playbackTick: null });
  },

  setTempo(bpm: number) {
    Transport.setTempo(bpm);
    set((s) => {
      const score = { ...s.score, tempo: bpm };
      return { score, tempo: bpm };
    });
  },

  setPlaybackTick(tick: number | null) {
    set({ playbackTick: tick });
  },

  toggleMetronome() {
    set((s) => {
      const next = !s.metronomeOn;
      Transport.setMetronome(next);
      return { metronomeOn: next };
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
    set({
      score: result.score,
      inputState: result.inputState,
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
    set((s) => {
      const score = structuredClone(s.score);
      const part = score.parts[partIndex];
      if (!part) return s;
      part.solo = !part.solo;
      return { score };
    });
  },

  toggleMute(partIndex: number) {
    set((s) => {
      const score = structuredClone(s.score);
      const part = score.parts[partIndex];
      if (!part) return s;
      part.muted = !part.muted;
      // Update playback reference so mute takes effect during playback
      Transport.updateScore(score);
      return { score };
    });
  },

  moveCursorToPart(partIndex: number) {
    set((s) => {
      if (partIndex < 0 || partIndex >= s.score.parts.length) return s;
      const cursor = { ...s.inputState.cursor };
      cursor.partIndex = partIndex;
      cursor.eventIndex = 0;
      cursor.voiceIndex = 0;
      return { inputState: { ...s.inputState, cursor } };
    });
  },

  moveCursorPart(direction: "up" | "down") {
    set((s) => {
      const cursor = { ...s.inputState.cursor };
      const newPartIndex =
        direction === "up" ? cursor.partIndex - 1 : cursor.partIndex + 1;
      if (newPartIndex < 0 || newPartIndex >= s.score.parts.length) return s;
      cursor.partIndex = newPartIndex;
      cursor.eventIndex = 0;
      cursor.voiceIndex = 0;
      return { inputState: { ...s.inputState, cursor } };
    });
  },

  // Phase 9: View modes

  setViewMode(mode: ViewModeType) {
    set((s) => {
      // Save current scroll position for current view
      const scrollEl = document.querySelector("[data-score-container]");
      const currentScroll = scrollEl?.scrollTop ?? 0;
      const newScrollPositions = {
        ...s.viewScrollPositions,
        [s.viewMode]: currentScroll,
      };

      return {
        viewMode: mode,
        viewConfig: getDefaultViewConfig(mode),
        viewScrollPositions: newScrollPositions,
      };
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

  // Plugin display toggles
  setShowTitle(show: boolean) {
    set({ showTitle: show });
  },
  setShowComposer(show: boolean) {
    set({ showComposer: show });
  },
  setShowLyrics(show: boolean) {
    set({ showLyrics: show });
  },
}));

// --- Auto-save: debounced save to localStorage on score changes ---

import { saveSnapshot } from "../fileio/history";

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

async function autoSave(score: Score, filePath: string | null): Promise<void> {
  try {
    const serialized = serializeScore(score);

    // Always persist JSON to localStorage as a fallback
    const payload = JSON.stringify({ score: serialized, filePath, savedAt: Date.now() });
    localStorage.setItem(AUTOSAVE_KEY, payload);

    // Save a snapshot to file history
    saveSnapshot(serialized, score.title || "Untitled");

    // If we have a file path, write MusicXML to disk (Tauri only)
    if (filePath) {
      try {
        const { exportToMusicXML } = await import("../musicxml");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        await writeTextFile(filePath, exportToMusicXML(score));
      } catch {
        // Not in Tauri or write failed — localStorage is the backup
      }
    }

    useEditorStore.getState().setAutoSaveStatus("Saved");
  } catch {
    // ignore storage errors
  }
}

// Subscribe to score changes and debounce auto-save
useEditorStore.subscribe((state, prevState) => {
  if (state.score !== prevState.score) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    useEditorStore.getState().setAutoSaveStatus("Saving...");
    autoSaveTimer = setTimeout(() => {
      autoSave(state.score, state.filePath);
    }, AUTOSAVE_DEBOUNCE_MS);
  }
});

// --- Restore from localStorage on init ---

function restoreAutoSave(): void {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.score === "string") {
      const score = deserializeScore(parsed.score);
      useEditorStore.setState({
        score,
        filePath: parsed.filePath ?? parsed.importSource ?? null,
        autoSaveStatus: "Restored from auto-save",
      });
    }
  } catch {
    // ignore corrupt auto-save data
  }
}

restoreAutoSave();
