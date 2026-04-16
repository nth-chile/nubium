/**
 * Note entry, duration, accidental, and pitch actions extracted from EditorState.
 */
import type {
  Accidental,
  DurationType,
  Octave,
  PitchClass,
} from "../model";
import type { CommandHistory } from "../commands/CommandHistory";
import { InsertNote } from "../commands/InsertNote";
import { AddPitchToChord } from "../commands/AddPitchToChord";
import { InsertTabNote } from "../commands/InsertTabNote";
import { InsertModeNote } from "../commands/InsertModeNote";
import { InsertRest } from "../commands/InsertRest";
import { OverwriteRest } from "../commands/OverwriteRest";
import { OverwriteNote } from "../commands/OverwriteNote";
import { DeleteNote } from "../commands/DeleteNote";
import { ChangePitch } from "../commands/ChangePitch";
import { ChangeDuration } from "../commands/ChangeDuration";
import { InsertGraceNote } from "../commands/InsertGraceNote";
import { ToggleDot } from "../commands/ToggleDot";
import { SetAccidental as SetAccidentalCmd } from "../commands/SetAccidental";
import { NudgePitch } from "../commands/NudgePitch";
import type { NoteEvent } from "../model/note";
import { pitchToMidi, midiToPitch, stepUp, stepDown, keyAccidental } from "../model/pitch";
import { updateSettings } from "../settings";
import { smartOctave, cursorOnExistingEvent, resolveChordHead, previewEventAt } from "./editorHelpers";
import type { StoreApi } from "zustand";

// We use `any` for the store type to avoid circular dependency with EditorStore interface
type GetState = StoreApi<any>["getState"];
type SetState = StoreApi<any>["setState"];

export function createNoteEntryActions(get: GetState, set: SetState, history: CommandHistory) {
  return {
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
            accidental: "natural",
            accidentalExplicit: false,
          },
        });
        return;
      }

      const clearAcc = { accidental: "natural" as Accidental, accidentalExplicit: false };

      // Grace note mode: insert a grace note before the current event
      if (state.inputState.graceNoteMode) {
        const cmd = new InsertGraceNote(
          pitchClass,
          octave,
          acc,
        );
        const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
        set({ score: result.score, inputState: { ...result.inputState, ...clearAcc }, lastEnteredPosition: { ...cursor } });
        previewEventAt(result.score, cursor);
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
        set({ score: result.score, inputState: { ...result.inputState, ...clearAcc }, lastEnteredPosition: { ...cursor } });
        previewEventAt(result.score, cursor);
        return;
      }

      // Cursor on existing event: overwrite it with the new note.
      if (cursorOnExistingEvent(state.score, cursor)) {
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
          inputState: { ...result.inputState, ...clearAcc },
          lastEnteredPosition: { ...cursor },
        });
        previewEventAt(result.score, cursor);
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
        inputState: { ...result.inputState, ...clearAcc },
        lastEnteredPosition: { ...cursor },
      });
      previewEventAt(result.score, cursor);
    },

    addPitchToChord(pitchClass: PitchClass) {
      const state = get();
      const { cursor } = state.inputState;
      const voice = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      if (!voice) return;

      // Target the current event, or the one just before the cursor (e.g. right after
      // step entry inserts a note and advances the cursor past it).
      let targetIndex = cursor.eventIndex;
      let target = voice.events[targetIndex];
      if ((!target || (target.kind !== "note" && target.kind !== "chord")) && targetIndex > 0) {
        targetIndex = targetIndex - 1;
        target = voice.events[targetIndex];
      }
      if (!target || (target.kind !== "note" && target.kind !== "chord")) return;

      const measure = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
      const fifths = measure?.keySignature?.fifths ?? 0;
      const acc = state.inputState.accidentalExplicit
        ? state.inputState.accidental
        : keyAccidental(pitchClass, fifths);

      // Collect pitches already in the target so we can avoid duplicates.
      const existing = target.kind === "note" ? [target.head.pitch] : target.heads.map((h: import("../model/note").NoteHead) => h.pitch);
      const refPitch = existing[0];
      if (!refPitch) return;
      const refMidi = pitchToMidi(refPitch);
      const isDup = (o: number) =>
        existing.some((p: import("../model").Pitch) => p.pitchClass === pitchClass && p.octave === o && p.accidental === acc);

      // Pick the nearest octave, but if it already exists, walk upward then downward to find a free one.
      let bestOctave = refPitch.octave;
      let bestDist = Infinity;
      for (let o = 0; o <= 9; o++) {
        const midi = pitchToMidi({ pitchClass, accidental: "natural", octave: o as Octave });
        const dist = Math.abs(midi - refMidi);
        if (dist < bestDist) {
          bestDist = dist;
          bestOctave = o as Octave;
        }
      }
      if (isDup(bestOctave)) {
        let found: Octave | null = null;
        for (let o = bestOctave + 1; o <= 9; o++) {
          if (!isDup(o)) { found = o as Octave; break; }
        }
        if (found == null) {
          for (let o = bestOctave - 1; o >= 0; o--) {
            if (!isDup(o)) { found = o as Octave; break; }
          }
        }
        if (found == null) return; // all octaves occupied — give up
        bestOctave = found;
      }

      const cmd = new AddPitchToChord(pitchClass, bestOctave, acc, targetIndex);
      const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
      // Select the newly added head so subsequent accidental/pitch shortcuts
      // target only that note, not the whole chord.
      const resultEvent = result.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex]?.events[targetIndex];
      const newHeadIndex = resultEvent?.kind === "chord" ? resultEvent.heads.length - 1 : null;
      set({
        score: result.score,
        inputState: {
          ...result.inputState,
          accidental: "natural",
          accidentalExplicit: false,
          selectedHeadIndex: newHeadIndex,
        },
      });
      previewEventAt(result.score, { ...cursor, eventIndex: targetIndex });
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
      previewEventAt(result.score, cursor);
    },

    insertRest() {
      const state = get();
      if (state.inputState.insertMode) {
        const cmd = new InsertModeNote("C", 4, "natural", { ...state.inputState.duration }, true);
        const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
        set({ score: result.score, inputState: result.inputState, lastEnteredPosition: null });
        return;
      }
      // Non-insert mode: if cursor is on an existing event, replace it with a rest.
      // Mirrors insertNote's OverwriteNote behavior for consistency.
      const cmd = cursorOnExistingEvent(state.score, state.inputState.cursor)
        ? new OverwriteRest({ ...state.inputState.duration })
        : new InsertRest({ ...state.inputState.duration });
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
      } else if (state.selection && !state.inputState.noteEntry) {
        const { partIndex, measureStart, measureEnd } = state.selection;
        history.pushSnapshot({ score: state.score, inputState: state.inputState });
        const score = structuredClone(state.score);
        const part = score.parts[partIndex];
        if (!part) return;
        for (let mi = measureStart; mi <= measureEnd; mi++) {
          const measure = part.measures[mi];
          if (!measure) continue;
          for (const voice of measure.voices) {
            voice.events = voice.events.map((ev: NoteEvent) => ({
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
      set((s: any) => ({
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
      } else if (state.selection && !state.inputState.noteEntry) {
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
              voice.events = voice.events.map((ev: NoteEvent) => {
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

      set((s: any) => ({
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

      // Note-level selection: apply accidental to selected events. If the selection
      // covers exactly one chord event and a head is selected (or defaulted), apply
      // only to that head instead of the whole chord.
      if (state.noteSelection) {
        const ns = state.noteSelection;
        const score = structuredClone(state.score);
        const singleEvent =
          ns.startMeasure === ns.endMeasure && ns.startEvent === ns.endEvent;
        if (singleEvent) {
          const voice = score.parts[ns.partIndex]?.measures[ns.startMeasure]?.voices[ns.voiceIndex];
          const ev = voice?.events[ns.startEvent];
          if (voice && ev && ev.kind === "chord" && ev.heads.length > 0) {
            const headIdx = resolveChordHead(
              score,
              { ...state.inputState.cursor, measureIndex: ns.startMeasure, voiceIndex: ns.voiceIndex, eventIndex: ns.startEvent },
              state.inputState.selectedHeadIndex,
            );
            const h = headIdx ?? 0;
            voice.events[ns.startEvent] = {
              ...ev,
              heads: ev.heads.map((head: import("../model/note").NoteHead, i: number) =>
                i === h ? { ...head, pitch: { ...head.pitch, accidental: acc } } : head,
              ),
            };
            set({ score, inputState: { ...state.inputState, accidental: "natural", accidentalExplicit: false } });
            return;
          }
        }
        for (let mi = ns.startMeasure; mi <= ns.endMeasure; mi++) {
          const voice = score.parts[ns.partIndex]?.measures[mi]?.voices[ns.voiceIndex];
          if (!voice) continue;
          const startIdx = mi === ns.startMeasure ? ns.startEvent : 0;
          const endIdx = mi === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
          for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
            voice.events[i] = applyAccToEvent(voice.events[i], acc);
          }
        }
        set({ score, inputState: { ...state.inputState, accidental: "natural", accidentalExplicit: false } });
        return;
      }

      // Bar-level selection: apply accidental to all pitched events
      if (state.selection && !state.inputState.noteEntry) {
        const { partIndex, measureStart, measureEnd } = state.selection;
        const score = structuredClone(state.score);
        const part = score.parts[partIndex];
        if (part) {
          for (let mi = measureStart; mi <= measureEnd; mi++) {
            const measure = part.measures[mi];
            if (!measure) continue;
            for (const voice of measure.voices) {
              voice.events = voice.events.map((ev: NoteEvent) => applyAccToEvent(ev, acc));
            }
          }
          set({ score, inputState: { ...state.inputState, accidental: "natural", accidentalExplicit: false } });
        }
        return;
      }

      // When on an existing note, toggle based on the note's actual accidental
      if (cursorOnExistingEvent(state.score, cursor)) {
        const voice = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
        const event = voice?.events[cursor.eventIndex];
        const headIdx = resolveChordHead(state.score, cursor, state.inputState.selectedHeadIndex);
        let noteAcc: Accidental = "natural";
        if (event?.kind === "note" || event?.kind === "grace") {
          noteAcc = event.head.pitch.accidental ?? "natural";
        } else if (event?.kind === "chord" && event.heads.length > 0) {
          const refHead =
            headIdx != null && headIdx >= 0 && headIdx < event.heads.length ? headIdx : 0;
          noteAcc = event.heads[refHead].pitch.accidental ?? "natural";
        }
        const newAcc = noteAcc === acc ? "natural" : acc;
        const cmd = new SetAccidentalCmd(newAcc, headIdx);
        const result = history.execute(cmd, {
          score: state.score,
          inputState: state.inputState,
        });
        set({
          score: result.score,
          inputState: { ...result.inputState, accidental: "natural", accidentalExplicit: false },
        });
        previewEventAt(result.score, cursor);
        return;
      }

      // No note at cursor — just toggle input state
      const newAcc = state.inputState.accidental === acc ? "natural" : acc;
      set((s: any) => ({
        inputState: {
          ...s.inputState,
          accidental: newAcc,
          accidentalExplicit: newAcc !== "natural",
        },
      }));
    },

    toggleNoteEntry() {
      set((s: any) => {
        const entering = !s.inputState.noteEntry;
        return {
          inputState: {
            ...s.inputState,
            noteEntry: entering,
            insertMode: entering ? s.inputState.insertMode : false,
            graceNoteMode: entering ? s.inputState.graceNoteMode : false,
            pendingPitch: entering ? s.inputState.pendingPitch : null,
          },
        };
      });
    },

    toggleInsertMode() {
      set((s: any) => {
        const newInsert = !s.inputState.insertMode;
        return {
          inputState: {
            ...s.inputState,
            insertMode: newInsert,
            noteEntry: newInsert || s.inputState.noteEntry,
          },
        };
      });
    },

    togglePitchBeforeDuration() {
      set((s: any) => {
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
      previewEventAt(result.score, notePos);
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
        const headIdx = resolveChordHead(state.score, state.inputState.cursor, state.inputState.selectedHeadIndex);
        const cmd = new NudgePitch(direction, "octave", headIdx);
        const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
        set({ score: result.score, inputState: result.inputState });
        previewEventAt(result.score, state.inputState.cursor);
        return;
      }
      // If we just entered a note (cursor advanced past it), nudge that note
      if (state.lastEnteredPosition && cursorOnExistingEvent(state.score, state.lastEnteredPosition)) {
        const tempInput = { ...state.inputState, cursor: { ...state.lastEnteredPosition } };
        const cmd = new NudgePitch(direction, "octave");
        const result = history.execute(cmd, { score: state.score, inputState: tempInput });
        set({ score: result.score, inputState: state.inputState });
        previewEventAt(result.score, state.lastEnteredPosition);
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
        const headIdx = resolveChordHead(state.score, state.inputState.cursor, state.inputState.selectedHeadIndex);
        const cmd = new NudgePitch(direction, mode, headIdx);
        const result = history.execute(cmd, { score: state.score, inputState: state.inputState });
        set({ score: result.score, inputState: result.inputState });
        previewEventAt(result.score, state.inputState.cursor);
        return;
      }
      // If we just entered a note (cursor advanced past it), nudge that note
      if (state.lastEnteredPosition && cursorOnExistingEvent(state.score, state.lastEnteredPosition)) {
        const tempInput = { ...state.inputState, cursor: { ...state.lastEnteredPosition } };
        const cmd = new NudgePitch(direction, mode);
        const result = history.execute(cmd, { score: state.score, inputState: tempInput });
        // Keep the current cursor position (don't jump back)
        set({ score: result.score, inputState: state.inputState });
        previewEventAt(result.score, state.lastEnteredPosition);
        return;
      }
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
  };
}
