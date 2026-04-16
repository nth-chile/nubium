/**
 * Articulation and cross-staff toggle actions extracted from EditorState.
 */
import { getInstrument } from "../model/instruments";
import { isCrossStaff } from "../model/note";
import { pitchToTab, STANDARD_TUNING } from "../model/guitar";
import type { CommandHistory } from "../commands/CommandHistory";
import { ToggleArticulation } from "../commands/ToggleArticulation";
import { ToggleCrossStaff } from "../commands/ToggleCrossStaff";
import type { StoreApi } from "zustand";

type GetState = StoreApi<any>["getState"];
type SetState = StoreApi<any>["setState"];

export function createArticulationActions(get: GetState, set: SetState, history: CommandHistory) {
  return {
    toggleArticulation(kind: import("../model/note").ArticulationKind) {
      const state = get();

      // Mutually exclusive groups
      const EXCLUSION_GROUPS: string[][] = [
        ["bend", "pre-bend", "bend-release"],
        ["slide-in-below", "slide-in-above"],
        ["slide-out-below", "slide-out-above", "slide-up", "slide-down"],
        ["down-bow", "up-bow"],
        ["down-stroke", "up-stroke", "fingerpick-p", "fingerpick-i", "fingerpick-m", "fingerpick-a"],
        ["hammer-on", "pull-off"],
        ["staccato", "staccatissimo"],
        ["accent", "marcato"],
        ["harmonic", "palm-mute", "tapping"],
      ];
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

      const SEMITONE_ARTS = new Set(["bend", "pre-bend", "bend-release"]);
      const BEND_CYCLE = [1, 2, 3];
      const toggleArt = (ev: import("../model/note").NoteEvent, nextEv?: import("../model/note").NoteEvent): import("../model/note").NoteEvent => {
        if (ev.kind === "rest" || ev.kind === "slash") return ev;

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

      const SLIDE_CONNECTIONS = new Set(["slide-up", "slide-down"]);
      const SLIDE_INS = new Set(["slide-in-below", "slide-in-above"]);

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
          const SLIDE_OUTS = new Set(["slide-out-below", "slide-out-above"]);
          strip(prev, SLIDE_OUTS);
        }
        if (SLIDE_INS.has(kind)) strip(prev, SLIDE_CONNECTIONS);
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
      if (state.selection && !state.inputState.noteEntry) {
        const { partIndex, measureStart, measureEnd } = state.selection;
        const score = structuredClone(state.score);
        const part = score.parts[partIndex];
        if (part) {
          for (let mi = measureStart; mi <= measureEnd; mi++) {
            const measure = part.measures[mi];
            if (!measure) continue;
            for (const voice of measure.voices) {
              voice.events = voice.events.map((ev: import("../model/note").NoteEvent, idx: number) => {
                const result = toggleArt(ev, voice.events[idx + 1]);
                voice.events[idx] = result;
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

      const partIndex = state.noteSelection?.partIndex ?? state.selection?.partIndex ?? state.inputState.cursor.partIndex;
      const part = state.score.parts[partIndex];
      if (!part) return;
      const instrument = getInstrument(part.instrumentId);
      if (!instrument || instrument.staves < 2) return;

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

      if (state.selection && !state.inputState.noteEntry) {
        const { partIndex: pi, measureStart, measureEnd } = state.selection;
        const score = structuredClone(state.score);
        const p = score.parts[pi];
        if (p) {
          for (let mi = measureStart; mi <= measureEnd; mi++) {
            const measure = p.measures[mi];
            if (!measure) continue;
            for (const voice of measure.voices) {
              const voiceStaff = voice.staff ?? 0;
              voice.events = voice.events.map((ev: import("../model/note").NoteEvent) => toggleCS(ev, voiceStaff));
            }
          }
          set({ score });
        }
        return;
      }

      const cmd = new ToggleCrossStaff();
      const result = history.execute(cmd, {
        score: state.score,
        inputState: state.inputState,
      });
      set({ score: result.score, inputState: result.inputState });
    },
  };
}
