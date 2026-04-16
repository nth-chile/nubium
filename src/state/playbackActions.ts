/**
 * Playback and text input (chord/lyric) actions extracted from EditorState.
 */
import { durationToTicks as durationToTicksFn, TICKS_PER_QUARTER } from "../model/duration";
import type { CommandHistory } from "../commands/CommandHistory";
import { SetChordSymbol } from "../commands/SetChordSymbol";
import { SetLyric } from "../commands/SetLyric";
import type { AnnotationBox } from "../renderer/vexBridge";
import { getGlobalPluginManager } from "../plugins/PluginManager";
import type { StoreApi } from "zustand";

type GetState = StoreApi<any>["getState"];
type SetState = StoreApi<any>["setState"];

export function createPlaybackActions(get: GetState, set: SetState, history: CommandHistory) {
  return {
    async play() {
      const service = getGlobalPluginManager()?.getPlaybackService();
      if (!service) return;
      const state = get();
      service.setCallbacks({
        onTick: (tick: number) => {
          set({ playbackTick: tick });
        },
        onStateChange: (transportState: string) => {
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
      } else if (noteSel && noteSel.rangeMode) {
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
      set((s: any) => {
        const score = { ...s.score, tempo: bpm };
        return { score, tempo: bpm };
      });
    },

    setPlaybackTick(tick: number | null) {
      set({ playbackTick: tick });
    },

    toggleMetronome() {
      set((s: any) => {
        const next = !s.metronomeOn;
        getGlobalPluginManager()?.getPlaybackService()?.setMetronome(next);
        return { metronomeOn: next };
      });
    },

    toggleCountIn() {
      set((s: any) => {
        const next = !s.countInOn;
        getGlobalPluginManager()?.getPlaybackService()?.setCountIn(next);
        return { countInOn: next };
      });
    },

    // --- Text input (chord/lyric) ---

    enterChordMode() {
      set((s: any) => ({
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
        (a: any) => a.kind === "lyric" && a.noteEventId === event.id && a.verseNumber === 1
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
      const state = get();
      const part = state.score.parts[box.partIndex];
      if (!part) return;
      const measure = part.measures[box.measureIndex];
      if (!measure) return;

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
        set((s: any) => ({
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
        const { partIndex, measureIndex, voiceIndex, eventIndex } = state.inputState.cursor;
        const voice =
          state.score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
        const event = voice?.events[eventIndex];
        if (!event) {
          set((s: any) => ({
            inputState: { ...s.inputState, textInputMode: null, textInputBuffer: "", textInputInitialValue: "" },
          }));
          return;
        }
        let beatOffset = 0;
        if (voice) {
          for (let i = 0; i < eventIndex && i < voice.events.length; i++) {
            beatOffset += durationToTicksFn(voice.events[i].duration, voice.events[i].tuplet);
          }
        }
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
        const nextCursor = result.inputState.cursor;
        const nextMeasure = result.score.parts[nextCursor.partIndex]?.measures[nextCursor.measureIndex];
        const nextEvent = nextMeasure?.voices[nextCursor.voiceIndex]?.events[nextCursor.eventIndex];
        const existingLyric = nextEvent && nextMeasure?.annotations.find(
          (a: any) => a.kind === "lyric" && a.noteEventId === nextEvent.id && a.verseNumber === state.inputState.lyricVerse
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
      set((s: any) => ({
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
        (a: any) => a.kind === "lyric" && a.noteEventId === event.id && a.verseNumber === v
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
  };
}
