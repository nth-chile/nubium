/**
 * Selection, clipboard, and cursor navigation actions extracted from EditorState.
 */
import type { Measure, NoteEventId } from "../model";
import { factory } from "../model";
import { getInstrument } from "../model/instruments";
import type { CommandHistory } from "../commands/CommandHistory";
import { DeleteNote } from "../commands/DeleteNote";
import { DeleteSelectedMeasures } from "../commands/DeleteSelectedMeasures";
import { ClearSelectedMeasures } from "../commands/ClearSelectedMeasures";
import type { Selection, NoteSelection } from "../plugins/PluginAPI";
import { newId, type VoiceId, type MeasureId } from "../model/ids";
import { previewEventAt, findOrCreateVoiceForStaff } from "./editorHelpers";
import type { StoreApi } from "zustand";

type GetState = StoreApi<any>["getState"];
type SetState = StoreApi<any>["setState"];

export function createSelectionActions(get: GetState, set: SetState, history: CommandHistory) {
  return {
    setSelection(selection: Selection | null) {
      set({ selection, noteSelection: null });
    },

    setNoteSelection(sel: NoteSelection | null) {
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
          rangeMode: true,
        },
        selection: null,
      });
    },

    extendNoteSelection(direction: "left" | "right") {
      set((s: any) => {
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
            rangeMode: true,
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

      // Single chord head selected: delete just that head via the cursor-aware path
      const headIdx = state.inputState.selectedHeadIndex;
      if (
        headIdx != null &&
        ns.startMeasure === ns.endMeasure &&
        ns.startEvent === ns.endEvent
      ) {
        const voice = state.score.parts[ns.partIndex]?.measures[ns.startMeasure]?.voices[ns.voiceIndex];
        const evt = voice?.events[ns.startEvent];
        if (evt?.kind === "chord") {
          const cursorAligned = {
            ...state.inputState,
            cursor: {
              ...state.inputState.cursor,
              partIndex: ns.partIndex,
              measureIndex: ns.startMeasure,
              voiceIndex: ns.voiceIndex,
              eventIndex: ns.startEvent,
            },
          };
          const cmd = new DeleteNote();
          const result = history.execute(cmd, { score: state.score, inputState: cursorAligned });
          set({ score: result.score, inputState: result.inputState, noteSelection: null });
          return;
        }
      }

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
          set({ selection: { ...sel, measureStart: sel.measureStart + 1 }, noteSelection: null });
        } else {
          const newEnd = Math.min(sel.measureEnd + 1, part.measures.length - 1);
          set({ selection: { ...sel, measureEnd: newEnd }, noteSelection: null });
        }
      } else {
        if (sel.measureEnd > sel.measureAnchor) {
          set({ selection: { ...sel, measureEnd: sel.measureEnd - 1 }, noteSelection: null });
        } else {
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

    clearSelectedMeasures() {
      const state = get();
      if (!state.selection) return;
      const cmd = new ClearSelectedMeasures(state.selection);
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

        // Single chord head selected: copy just that head as a single-note event.
        const headIdx = state.inputState.selectedHeadIndex;
        if (
          headIdx != null &&
          ns.startMeasure === ns.endMeasure &&
          ns.startEvent === ns.endEvent
        ) {
          const voice = part.measures[ns.startMeasure]?.voices[ns.voiceIndex];
          const evt = voice?.events[ns.startEvent];
          if (evt?.kind === "chord" && headIdx >= 0 && headIdx < evt.heads.length) {
            const headEvent: import("../model/note").NoteEvent = {
              kind: "note",
              id: evt.id,
              duration: evt.duration,
              head: evt.heads[headIdx],
              stemDirection: evt.stemDirection,
              tabInfo: evt.tabInfo,
              articulations: evt.articulations,
              tuplet: evt.tuplet,
              renderStaff: evt.renderStaff,
            };
            const cloned = structuredClone({ voiceIndex: ns.voiceIndex, measures: [[headEvent]] });
            set({ clipboardEvents: cloned, clipboardMeasures: null });
            const payload = JSON.stringify({ nubium: "events", data: cloned });
            navigator.clipboard.writeText(payload).catch(() => {});
            return;
          }
        }

        // Collect selected events from the active voice, grouped by source measure
        const measures: import("../model/note").NoteEvent[][] = [];
        for (let m = ns.startMeasure; m <= ns.endMeasure; m++) {
          const voice = part.measures[m]?.voices[ns.voiceIndex];
          if (!voice) { measures.push([]); continue; }
          const startIdx = m === ns.startMeasure ? ns.startEvent : 0;
          const endIdx = m === ns.endMeasure ? ns.endEvent : voice.events.length - 1;
          measures.push(voice.events.slice(startIdx, endIdx + 1));
        }
        const cloned = structuredClone({ voiceIndex: ns.voiceIndex, measures });
        set({ clipboardEvents: cloned, clipboardMeasures: null });
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
        ? systemClipboard.data as { voiceIndex: number; measures: import("../model/note").NoteEvent[][] }
        : state.clipboardEvents;
      const clipboardMeasures = systemClipboard?.nubium === "measures"
        ? systemClipboard.data as Measure[]
        : state.clipboardMeasures;

      // Note-level paste: distribute events across measures
      if (clipboardEvents && clipboardEvents.measures.some((m: any) => m.length > 0)) {
        const score = structuredClone(state.score);
        const part = score.parts[cursor.partIndex];
        if (!part) return;

        const ns = state.noteSelection;
        const ms = state.selection;
        const startMeasure = ns ? ns.startMeasure : ms ? ms.measureStart : cursor.measureIndex;
        const startEventIdx = ns ? ns.startEvent : ms ? 0 : cursor.eventIndex;
        const destStave = cursor.staveIndex ?? 0;

        // Clear the selected range before inserting.
        // Only clear the source voice if it's on the same staff as the destination —
        // otherwise we'd wipe treble notes when pasting onto bass.
        if (ns) {
          const nsVoice = part.measures[ns.startMeasure]?.voices[ns.voiceIndex];
          const nsStaff = nsVoice?.staff ?? 0;
          if (nsStaff === destStave) {
            for (let m = ns.endMeasure; m >= ns.startMeasure; m--) {
              const vc = part.measures[m]?.voices[ns.voiceIndex];
              if (!vc) continue;
              const sIdx = m === ns.startMeasure ? ns.startEvent : 0;
              const eIdx = m === ns.endMeasure ? ns.endEvent : vc.events.length - 1;
              vc.events.splice(sIdx, eIdx - sIdx + 1);
            }
          }
        } else if (ms) {
          for (let m = ms.measureEnd; m >= ms.measureStart; m--) {
            const measure = part.measures[m];
            if (!measure) continue;
            const flatIdx = findOrCreateVoiceForStaff(measure, destStave, 0);
            measure.voices[flatIdx].events = [];
          }
        }

        // Deep-clone source measures and re-id every event
        const sourceMeasures: import("../model/note").NoteEvent[][] =
          structuredClone(clipboardEvents.measures).map((evs: any) =>
            evs.map((e: any) => { e.id = newId<NoteEventId>("evt"); return e; })
          );

        let lastMeasure = startMeasure;
        let lastEventIdx = startEventIdx;
        let lastDestVoiceIdx = cursor.voiceIndex;

        for (let i = 0; i < sourceMeasures.length; i++) {
          const destIdx = startMeasure + i;
          const destMeasure = part.measures[destIdx];
          if (!destMeasure) break;

          const destVoiceFlat = findOrCreateVoiceForStaff(destMeasure, destStave, 0);
          const destVoice = destMeasure.voices[destVoiceFlat];
          if (!destVoice) break;

          const srcEvents = sourceMeasures[i];
          if (srcEvents.length === 0) { lastMeasure = destIdx; lastEventIdx = 0; lastDestVoiceIdx = destVoiceFlat; continue; }

          const offset = i === 0 ? Math.min(startEventIdx, destVoice.events.length) : 0;
          const replaceCount = Math.min(srcEvents.length, destVoice.events.length - offset);
          destVoice.events.splice(offset, replaceCount, ...srcEvents);

          lastMeasure = destIdx;
          lastEventIdx = offset + srcEvents.length - 1;
          lastDestVoiceIdx = destVoiceFlat;
        }

        history.pushSnapshot({ score: state.score, inputState: state.inputState });
        set({
          score,
          inputState: { ...state.inputState, cursor: { ...cursor, measureIndex: lastMeasure, eventIndex: Math.max(0, lastEventIdx), voiceIndex: lastDestVoiceIdx } },
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

      const measuresToInsert: Measure[] = structuredClone(clipboardMeasures).map((m: Measure) => {
        m.id = newId<MeasureId>("msr");

        if (refMeasure) {
          m.clef = { ...refMeasure.clef };
          m.keySignature = { ...refMeasure.keySignature };
          m.timeSignature = { ...refMeasure.timeSignature };
        }

        m.annotations = m.annotations.filter(
          (a) => a.kind !== "lyric" && a.kind !== "rehearsal-mark" && a.kind !== "tempo-mark"
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

      // If a measure selection is active, paste at its start (replace the range).
      // Otherwise paste at the cursor.
      const startIndex = state.selection ? state.selection.measureStart : cursor.measureIndex;
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
      const destStave = cursor.staveIndex ?? 0;
      for (let i = 0; i < measuresToInsert.length; i++) {
        const targetIdx = startIndex + i;
        const targetMeasure = part.measures[targetIdx];
        if (targetStaves >= 2) {
          // Grand staff: only paste voices from the source staff, remap to destination staff
          const keptVoices = targetMeasure.voices.filter((v) => (v.staff ?? 0) !== destStave);
          // Determine which staff the clipboard voices came from — pick the most common staff tag
          const sourceStaffCounts = new Map<number, number>();
          for (const v of measuresToInsert[i].voices) {
            const s = v.staff ?? 0;
            sourceStaffCounts.set(s, (sourceStaffCounts.get(s) ?? 0) + 1);
          }
          // Default: use staff 0 (treble) voices from source, or whichever has the most voices
          let sourceStaff = 0;
          if (sourceStaffCounts.size > 0) {
            sourceStaff = [...sourceStaffCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
          }
          const pastedVoices = measuresToInsert[i].voices
            .filter((v) => (v.staff ?? 0) === sourceStaff)
            .map((v) => ({ ...v, staff: destStave }));
          targetMeasure.voices = [...keptVoices, ...pastedVoices];
        } else {
          targetMeasure.voices = measuresToInsert[i].voices;
        }
        const pastedAnnotations = measuresToInsert[i].annotations;
        if (pastedAnnotations.length > 0) {
          const existing = targetMeasure.annotations;
          targetMeasure.annotations = [...existing, ...pastedAnnotations];
        }
      }

      const lastPasted = Math.min(startIndex + measuresToInsert.length - 1, part.measures.length - 1);
      set({
        score,
        inputState: { ...state.inputState, cursor: { ...cursor, measureIndex: lastPasted, eventIndex: 0 } },
        selection: null,
      });
    },

    setCursorDirect(cursor: any, tabInputActive?: boolean) {
      set((s: any) => ({
        inputState: {
          ...s.inputState,
          cursor,
          tabInputActive: tabInputActive ?? s.inputState.tabInputActive,
          tabFretBuffer: tabInputActive !== undefined && tabInputActive !== s.inputState.tabInputActive ? "" : s.inputState.tabFretBuffer,
        },
      }));
    },

    setSelectedHeadIndex(index: number | null) {
      set((s: any) => ({ inputState: { ...s.inputState, selectedHeadIndex: index } }));
    },

    cycleChordHead(direction: "next" | "prev") {
      const state = get();
      const { cursor } = state.inputState;
      const voice = state.score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
      let targetIndex = cursor.eventIndex;
      let target = voice?.events[targetIndex];
      if ((!target || target.kind !== "chord") && targetIndex > 0) {
        targetIndex = targetIndex - 1;
        target = voice?.events[targetIndex];
      }
      if (!target || target.kind !== "chord" || target.heads.length === 0) return;

      const count = target.heads.length;
      const current = state.inputState.selectedHeadIndex ?? 0;
      const next = direction === "next"
        ? (current + 1) % count
        : (current - 1 + count) % count;

      set({
        inputState: { ...state.inputState, selectedHeadIndex: next },
        noteSelection: {
          partIndex: cursor.partIndex,
          voiceIndex: cursor.voiceIndex,
          startMeasure: cursor.measureIndex,
          startEvent: targetIndex,
          endMeasure: cursor.measureIndex,
          endEvent: targetIndex,
          anchorMeasure: cursor.measureIndex,
          anchorEvent: targetIndex,
        },
        selection: null,
      });
    },

    moveCursor(direction: "left" | "right") {
      set((s: any) => {
        const cursor = { ...s.inputState.cursor };
        const part = s.score.parts[cursor.partIndex];
        const voice = part?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
        const eventCount = voice?.events.length ?? 0;
        if (direction === "right") {
          if (cursor.eventIndex < eventCount) {
            cursor.eventIndex++;
          } else {
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

        return { inputState: { ...s.inputState, cursor, pendingPitch: null, selectedHeadIndex: null }, lastEnteredPosition: null };
      });
      const after = get();
      if (!after.isPlaying) previewEventAt(after.score, after.inputState.cursor);
    },

    moveCursorToMeasure(direction: "next" | "prev") {
      set((s: any) => {
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
      const after = get();
      if (!after.isPlaying) previewEventAt(after.score, after.inputState.cursor);
    },

    moveCursorToPart(partIndex: number) {
      set((s: any) => {
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
      set((s: any) => {
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
            cursor.voiceIndex = 0;
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
      const after = get();
      if (!after.isPlaying) previewEventAt(after.score, after.inputState.cursor);
    },
  };
}
