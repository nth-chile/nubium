import { create } from "zustand";
import type {
  Score,
  DurationType,
  Accidental,
  PitchClass,
  Octave,
  NoteEventId,
  Clef,
  TimeSignature,
  KeySignature,
} from "../model";
import type { ViewModeType } from "../views/ViewMode";
import { getDefaultViewConfig, type ViewConfig } from "../views/ViewMode";
import { DURATION_TYPES_ORDERED } from "../model";
import { durationToTicks as durationToTicksFn } from "../model/duration";
import { factory } from "../model";
import { defaultInputState, type InputState, type CursorPosition } from "../input/InputState";
import { CommandHistory } from "../commands/CommandHistory";
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
import type { NavigationMarkType } from "../commands/SetNavigationMark";
import type { BarlineType, Volta } from "../model";
import type { NoteBox } from "../renderer/vexBridge";
import { newId, type VoiceId } from "../model/ids";
import * as Transport from "../playback/TonePlayback";

const history = new CommandHistory();

interface EditorStore {
  // Document
  score: Score;
  filePath: string | null;
  isDirty: boolean;

  // Input
  inputState: InputState;

  // Rendering
  noteBoxes: Map<NoteEventId, NoteBox>;

  // Actions
  insertNote(pitchClass: PitchClass): void;
  insertRest(): void;
  deleteNote(): void;
  setDuration(type: DurationType): void;
  toggleDot(): void;
  setAccidental(acc: Accidental): void;
  moveCursor(direction: "left" | "right"): void;
  moveCursorToMeasure(direction: "next" | "prev"): void;
  changeOctave(direction: "up" | "down"): void;
  setScore(score: Score): void;
  setFilePath(path: string | null): void;
  setNoteBoxes(boxes: Map<NoteEventId, NoteBox>): void;
  undo(): void;
  redo(): void;

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
  isDirty: false,
  inputState: defaultInputState(),
  noteBoxes: new Map(),
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

  insertNote(pitchClass: PitchClass) {
    const state = get();
    const { cursor } = state.inputState;

    // If cursor is on an existing note, change pitch instead of inserting
    if (cursorOnExistingEvent(state.score, cursor)) {
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
        isDirty: true,
      });
      return;
    }

    const cmd = new InsertNote(
      pitchClass,
      state.inputState.octave as Octave,
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
      isDirty: true,
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
      isDirty: true,
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
      isDirty: true,
    });
  },

  setDuration(type: DurationType) {
    set((s) => ({
      inputState: {
        ...s.inputState,
        duration: { type, dots: 0 },
      },
    }));
  },

  toggleDot() {
    set((s) => ({
      inputState: {
        ...s.inputState,
        duration: {
          ...s.inputState.duration,
          dots: ((s.inputState.duration.dots + 1) % 4) as 0 | 1 | 2 | 3,
        },
      },
    }));
  },

  setAccidental(acc: Accidental) {
    set((s) => ({
      inputState: {
        ...s.inputState,
        accidental: s.inputState.accidental === acc ? "natural" : acc,
      },
    }));
  },

  moveCursor(direction: "left" | "right") {
    set((s) => {
      const cursor = { ...s.inputState.cursor };
      const voice =
        s.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      if (!voice) return s;

      if (direction === "right") {
        if (cursor.eventIndex < voice.events.length) {
          cursor.eventIndex++;
        } else {
          // Move to next measure
          const part = s.score.parts[cursor.partIndex];
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
          const prevVoice =
            s.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
          cursor.eventIndex = prevVoice?.events.length ?? 0;
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
    set({ score, isDirty: false });
  },

  setFilePath(path: string | null) {
    set({ filePath: path });
  },

  setNoteBoxes(boxes: Map<NoteEventId, NoteBox>) {
    set({ noteBoxes: boxes });
  },

  undo() {
    const state = get();
    const result = history.undo({
      score: state.score,
      inputState: state.inputState,
    });
    if (result) {
      set({ score: result.score, inputState: result.inputState });
    }
  },

  redo() {
    const state = get();
    const result = history.redo({
      score: state.score,
      inputState: state.inputState,
    });
    if (result) {
      set({ score: result.score, inputState: result.inputState });
    }
  },

  // Phase 2 actions

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
      isDirty: true,
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
      isDirty: true,
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
      isDirty: true,
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
      isDirty: true,
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
      isDirty: true,
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
      isDirty: true,
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
      isDirty: true,
    });
  },

  // Phase 3 actions

  enterChordMode() {
    set((s) => ({
      inputState: {
        ...s.inputState,
        textInputMode: "chord",
        textInputBuffer: "",
      },
    }));
  },

  enterLyricMode() {
    set((s) => ({
      inputState: {
        ...s.inputState,
        textInputMode: "lyric",
        textInputBuffer: "",
      },
    }));
  },

  commitTextInput(text: string) {
    const state = get();
    const { textInputMode } = state.inputState;
    if (!textInputMode || !text.trim()) {
      // Just cancel if empty
      set((s) => ({
        inputState: {
          ...s.inputState,
          textInputMode: null,
          textInputBuffer: "",
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
          beatOffset += durationToTicksFn(voice.events[i].duration);
        }
      }
      const cmd = new SetChordSymbol(text, beatOffset);
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
        },
        isDirty: true,
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
          // Stay in lyric mode to allow advancing through notes
          textInputMode: "lyric",
          textInputBuffer: "",
        },
        isDirty: true,
      });
    }
  },

  cancelTextInput() {
    set((s) => ({
      inputState: {
        ...s.inputState,
        textInputMode: null,
        textInputBuffer: "",
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
      return { score, tempo: bpm, isDirty: true };
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
      isDirty: true,
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
      isDirty: true,
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
      isDirty: true,
    });
  },

  toggleSolo(partIndex: number) {
    set((s) => {
      const score = structuredClone(s.score);
      const part = score.parts[partIndex];
      if (!part) return s;
      part.solo = !part.solo;
      return { score, isDirty: true };
    });
  },

  toggleMute(partIndex: number) {
    set((s) => {
      const score = structuredClone(s.score);
      const part = score.parts[partIndex];
      if (!part) return s;
      part.muted = !part.muted;
      return { score, isDirty: true };
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
      isDirty: true,
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
      isDirty: true,
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
      isDirty: true,
    });
  },
}));
