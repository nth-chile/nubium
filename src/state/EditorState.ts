import { create } from "zustand";
import { serialize as serializeScore, deserialize as deserializeScore } from "../serialization";
import type {
  Score,
  DurationType,
  Accidental,
  PitchClass,
  NoteEventId,
  Clef,
  TimeSignature,
  KeySignature,
} from "../model";
import { defaultViewConfig, getPartDisplay, type ViewConfig, type NotationDisplay } from "../views/ViewMode";
import { factory } from "../model";
import { defaultInputState, type CursorPosition } from "../input/InputState";
import { CommandHistory } from "../commands/CommandHistory";
import type { Selection, NoteSelection } from "../plugins/PluginAPI";
import { InsertMeasure } from "../commands/InsertMeasure";
import { DeleteMeasure } from "../commands/DeleteMeasure";
import { ChangeTimeSig } from "../commands/ChangeTimeSig";
import { ChangeKeySig } from "../commands/ChangeKeySig";
import { ChangeClef } from "../commands/ChangeClef";
import { SetRehearsalMark } from "../commands/SetRehearsalMark";
import { SetTempo } from "../commands/SetTempo";
import { SetSwing } from "../commands/SetSwing";
import { AddPart } from "../commands/AddPart";
import { ChangeInstrument } from "../commands/ChangeInstrument";
import { RemovePart } from "../commands/RemovePart";
import { ReorderParts } from "../commands/ReorderParts";
import { SetRepeatBarline } from "../commands/SetRepeatBarline";
import { SetRepeatCount } from "../commands/SetRepeatCount";
import { SetMeasureBreak } from "../commands/SetMeasureBreak";
import type { MeasureBreak } from "../model";
import { SetVolta } from "../commands/SetVolta";
import { SetNavigationMark } from "../commands/SetNavigationMark";
import { SetDynamic } from "../commands/SetDynamic";
import { TogglePickup } from "../commands/TogglePickup";
import { SetSlur } from "../commands/SetSlur";
import { ToggleTie } from "../commands/ToggleTie";
import { ToggleMute } from "../commands/ToggleMute";
import { SetHairpin } from "../commands/SetHairpin";
import { SetStemDirection } from "../commands/SetStemDirection";
import { SetScoreMeta } from "../commands/SetScoreMeta";
import { SetPartProperty } from "../commands/SetPartProperty";
import type { NavigationMarkType } from "../commands/SetNavigationMark";
import type { BarlineType, Volta } from "../model";
import type { NoteBox, AnnotationBox } from "../renderer/vexBridge";
import { newId, type VoiceId } from "../model/ids";
import { getGlobalPluginManager } from "../plugins/PluginManager";
import { createNoteEntryActions } from "./noteEntryActions";
import { createSelectionActions } from "./selectionActions";
import { createPlaybackActions } from "./playbackActions";
import { createArticulationActions } from "./articulationActions";

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
  inputState: import("../input/InputState").InputState;

  // Rendering
  noteBoxes: Map<NoteEventId, NoteBox>;
  hitBoxes: NoteBox[];
  annotationBoxes: AnnotationBox[];
  breakBoxes: import("../renderer/ScoreRenderer").BreakBox[];
  measurePositions: { partIndex: number; measureIndex: number; staveIndex: number; x: number; y: number; width: number; height: number; noteStartX: number; isTab?: boolean }[];
  titlePositions: { title?: { x: number; y: number; width: number; height: number }; composer?: { x: number; y: number; width: number; height: number } };
  editingTitle: boolean;
  editingComposer: boolean;
  selection: Selection | null;
  noteSelection: NoteSelection | null;
  clipboardMeasures: import("../model").Measure[] | null;
  clipboardEvents: { voiceIndex: number; measures: import("../model/note").NoteEvent[][] } | null;
  /** Position of the last note entered — nudge commands target this when cursor has advanced past it */
  lastEnteredPosition: CursorPosition | null;

  // Actions
  insertNote(pitchClass: PitchClass): void;
  addPitchToChord(pitchClass: PitchClass): void;
  insertTabNote(fret: number, string: number): void;
  insertRest(): void;
  deleteNote(): void;
  setDuration(type: DurationType): void;
  toggleDot(): void;
  setAccidental(acc: Accidental): void;
  toggleNoteEntry(): void;
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
  setBreakBoxes(boxes: import("../renderer/ScoreRenderer").BreakBox[]): void;
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
  clearSelectedMeasures(): void;
  copySelection(): void;
  pasteAtCursor(): Promise<void>;
  setCursorDirect(cursor: CursorPosition, tabInputActive?: boolean): void;
  setSelectedHeadIndex(index: number | null): void;
  cycleChordHead(direction: "next" | "prev"): void;
  setTitle(title: string): void;
  setComposer(composer: string): void;
  undo(): void;
  redo(): void;

  // Articulations
  toggleArticulation(kind: import("../model/note").ArticulationKind): void;
  toggleCrossStaff(): void;
  toggleTie(): void;
  toggleNoteMute(): void;
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
  changeInstrument(partIndex: number, instrumentId: string): void;
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
  setRepeatCount(times: number | undefined): void;
  setMeasureBreak(breakType: MeasureBreak | null): void;
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

const initialScore = factory.emptyScore();
export const useEditorStore = create<EditorStore>((set, get) => {
  const noteEntry = createNoteEntryActions(get, set, history);
  const selection = createSelectionActions(get, set, history);
  const playback = createPlaybackActions(get, set, history);
  const articulation = createArticulationActions(get, set, history);

  return {
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
    breakBoxes: [],
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

    // --- Spread extracted action modules ---
    ...noteEntry,
    ...selection,
    ...playback,
    ...articulation,

    // --- Actions that remain in this file ---

    setPopover(popover: EditorStore["popover"]) {
      set({ popover });
    },

    setDynamic(level: import("../model/annotations").DynamicLevel | null) {
      const state = get();
      const { cursor } = state.inputState;
      const voice = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      if (!voice || voice.events.length === 0) return;
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
        set({ slurStartEventId: evt.id });
      } else {
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

    toggleNoteMute() {
      const state = get();
      const cmd = new ToggleMute();
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

    setScore(score: Score) {
      const state = get();
      history.pushSnapshot({ score: state.score, inputState: state.inputState });
      set((s) => ({
        score,
        inputState: defaultInputState(),
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

    setBreakBoxes(boxes) {
      set({ breakBoxes: boxes });
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

    // --- Phase 2: Measure/sig operations ---

    setVoice(n: number) {
      set((s) => {
        const score = structuredClone(s.score);
        const cursor = { ...s.inputState.cursor };
        const { partIndex, measureIndex } = cursor;
        const staveIndex = cursor.staveIndex ?? 0;

        const measure = score.parts[partIndex]?.measures[measureIndex];
        if (!measure) return s;

        const staffVoices = measure.voices
          .map((v, i) => ({ voice: v, flatIndex: i }))
          .filter((e) => (e.voice.staff ?? 0) === staveIndex);

        if (n < staffVoices.length) {
          cursor.voiceIndex = staffVoices[n].flatIndex;
        } else {
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
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    deleteMeasure() {
      const state = get();
      const cmd = new DeleteMeasure();
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    changeTimeSig(timeSig: TimeSignature) {
      const state = get();
      const cmd = new ChangeTimeSig(timeSig);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    changeKeySig(keySig: KeySignature) {
      const state = get();
      const cmd = new ChangeKeySig(keySig);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    changeClef(clef: Clef) {
      const state = get();
      const cmd = new ChangeClef(clef);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    // --- Swing ---

    setSwing(swing: import("../model/annotations").SwingSettings | undefined) {
      const state = get();
      const cmd = new SetSwing(swing);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    // --- Part management ---

    addPart(instrumentId: string) {
      const state = get();
      const cmd = new AddPart(instrumentId);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    changeInstrument(partIndex: number, instrumentId: string) {
      const state = get();
      const cmd = new ChangeInstrument(partIndex, instrumentId);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    removePart(partIndex: number) {
      const state = get();
      const cmd = new RemovePart(partIndex);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      const hidden = new Set<number>();
      for (const i of state.hiddenParts) {
        if (i < partIndex) hidden.add(i);
        else if (i > partIndex) hidden.add(i - 1);
      }
      set({ score: result.score, inputState: result.inputState, hiddenParts: hidden });
    },

    reorderPart(partIndex: number, direction: "up" | "down") {
      const state = get();
      const cmd = new ReorderParts(partIndex, direction);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    toggleSolo(partIndex: number) {
      const state = get();
      const part = state.score.parts[partIndex];
      if (!part) return;
      const cmd = new SetPartProperty(partIndex, { field: "solo", value: !part.solo });
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      getGlobalPluginManager()?.getPlaybackService()?.updateScore(result.score);
      set({ score: result.score, inputState: result.inputState });
    },

    toggleMute(partIndex: number) {
      const state = get();
      const part = state.score.parts[partIndex];
      if (!part) return;
      const cmd = new SetPartProperty(partIndex, { field: "muted", value: !part.muted });
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
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
          const visibleCount = s.score.parts.length - hidden.size;
          if (visibleCount <= 1) return s;
          hidden.add(partIndex);
        }
        return { hiddenParts: hidden };
      });
    },

    // --- View modes ---

    toggleNotation(type: "standard" | "tab" | "slash", partIndex?: number) {
      set((s) => {
        const newDisplay = { ...s.viewConfig.notationDisplay };
        const pi = partIndex ?? s.inputState.cursor.partIndex;
        const current = getPartDisplay(s.viewConfig, pi);
        const toggled = !current[type];
        const updated = { ...current, [type]: toggled };
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

    // --- Navigation marks ---

    setRepeatBarline(barlineType: BarlineType) {
      const state = get();
      const cmd = new SetRepeatBarline(barlineType);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    setRepeatCount(times: number | undefined) {
      const state = get();
      const cmd = new SetRepeatCount(times);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    setMeasureBreak(breakType: MeasureBreak | null) {
      const state = get();
      const cmd = new SetMeasureBreak(breakType);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    setVolta(volta: Volta | null) {
      const state = get();
      const cmd = new SetVolta(volta);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },

    setNavigationMark(markType: NavigationMarkType, value?: string | boolean) {
      const state = get();
      const cmd = new SetNavigationMark(markType, value);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      set({ score: result.score, inputState: result.inputState });
    },
  };
});

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

    const tauri = await getTauriRecoveryPath();
    if (tauri) {
      await tauri.fs.writeTextFile(tauri.path, payload);
    } else {
      localStorage.setItem(AUTOSAVE_KEY, payload);
    }

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
    const tauri = await getTauriRecoveryPath();
    let raw: string | null = null;
    if (tauri) {
      try {
        raw = await tauri.fs.readTextFile(tauri.path);
      } catch {
        // no recovery file yet
      }
    }
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
