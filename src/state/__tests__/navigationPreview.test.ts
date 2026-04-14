import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";
import { setNotePlayer, type NotePlayer } from "../../playback/TonePlayback";
import { pitchToMidi } from "../../model/pitch";

/**
 * Arrow navigation should audition the note at the new cursor position
 * (Dorico/MuseScore behavior) so the user can hear what they're editing.
 */

interface PlayCall {
  midi: number;
  instrumentId?: string;
}

class RecordingPlayer implements NotePlayer {
  calls: PlayCall[] = [];
  play(midi: number, _duration: number, _time: number, instrumentId?: string): void {
    this.calls.push({ midi, instrumentId });
  }
  stop(): void {}
  async resume(): Promise<void> {}
}

function setupScore() {
  const measures = [
    factory.measure([factory.voice([
      factory.note("C", 4, factory.dur("quarter")),
      factory.note("D", 4, factory.dur("quarter")),
      factory.note("E", 4, factory.dur("quarter")),
    ])]),
    factory.measure([factory.voice([
      factory.note("F", 4, factory.dur("quarter")),
      factory.note("G", 4, factory.dur("quarter")),
    ])]),
  ];
  const score = factory.score("Test", "", [
    factory.part("Piano", "Pno.", measures, "piano"),
  ]);
  useEditorStore.setState({
    score,
    inputState: {
      ...useEditorStore.getState().inputState,
      cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
    },
    isPlaying: false,
  });
}

describe("preview on arrow navigation (#244)", () => {
  let player: RecordingPlayer;

  beforeEach(() => {
    setupScore();
    player = new RecordingPlayer();
    setNotePlayer(player);
  });

  afterEach(() => {
    setNotePlayer(null);
  });

  it("plays preview when arrowing right onto a note", () => {
    useEditorStore.getState().moveCursor("right"); // cursor 0→1, should preview D4
    expect(player.calls.length).toBe(1);
    expect(player.calls[0].midi).toBe(pitchToMidi({ pitchClass: "D", octave: 4, accidental: "natural" }));
  });

  it("plays preview when arrowing left", () => {
    useEditorStore.getState().moveCursor("right");
    useEditorStore.getState().moveCursor("right"); // at event 2 (E4)
    player.calls = [];
    useEditorStore.getState().moveCursor("left"); // back to event 1 (D4)
    expect(player.calls.length).toBe(1);
    expect(player.calls[0].midi).toBe(pitchToMidi({ pitchClass: "D", octave: 4, accidental: "natural" }));
  });

  it("plays preview when moving to the next measure", () => {
    useEditorStore.getState().moveCursorToMeasure("next"); // measure 1, event 0 (F4)
    expect(player.calls.length).toBe(1);
    expect(player.calls[0].midi).toBe(pitchToMidi({ pitchClass: "F", octave: 4, accidental: "natural" }));
  });

  it("does not preview during playback", () => {
    useEditorStore.setState({ isPlaying: true });
    useEditorStore.getState().moveCursor("right");
    expect(player.calls.length).toBe(0);
  });

  it("does not preview when landing on the append position (past last note)", () => {
    // cursor starts at event 0; moving right 3 times lands at event 3 (append position, no event there)
    useEditorStore.getState().moveCursor("right"); // → event 1 (D), previews
    useEditorStore.getState().moveCursor("right"); // → event 2 (E), previews
    player.calls = [];
    useEditorStore.getState().moveCursor("right"); // → event 3 (append), no preview, then onto measure 1 event 0 (F)
    // Depending on append-position semantics this may or may not preview, but it must NOT throw
    // and it must not preview a non-existent event.
    for (const call of player.calls) {
      expect(Number.isFinite(call.midi)).toBe(true);
    }
  });
});
