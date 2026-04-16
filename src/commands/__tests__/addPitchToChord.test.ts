import { describe, it, expect } from "vitest";
import { AddPitchToChord } from "../AddPitchToChord";
import { factory } from "../../model";
import { defaultInputState } from "../../input/InputState";
import type { EditorSnapshot } from "../Command";

function makeSnapshot(events: import("../../model/note").NoteEvent[]): EditorSnapshot {
  const score = factory.score("Test", "", [
    factory.part("P", "P", [
      factory.measure([factory.voice(events)]),
    ]),
  ]);
  return { score, inputState: defaultInputState() };
}

describe("AddPitchToChord", () => {
  it("converts a note to a chord by adding a pitch", () => {
    const state = makeSnapshot([
      factory.note("C", 4, factory.dur("quarter")),
    ]);

    const cmd = new AddPitchToChord("E", 4, "natural", 0);
    const result = cmd.execute(state);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("chord");
    if (evt.kind === "chord") {
      expect(evt.heads).toHaveLength(2);
      expect(evt.heads[0].pitch.pitchClass).toBe("C");
      expect(evt.heads[1].pitch.pitchClass).toBe("E");
    }
  });

  it("adds a pitch to an existing chord", () => {
    const state = makeSnapshot([
      factory.chord(
        [factory.noteHead("C", 4), factory.noteHead("E", 4)],
        factory.dur("quarter"),
      ),
    ]);

    const cmd = new AddPitchToChord("G", 4, "natural", 0);
    const result = cmd.execute(state);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "chord") {
      expect(evt.heads).toHaveLength(3);
      expect(evt.heads[2].pitch.pitchClass).toBe("G");
    }
  });

  it("does not add duplicate pitch to chord", () => {
    const state = makeSnapshot([
      factory.chord(
        [factory.noteHead("C", 4), factory.noteHead("E", 4)],
        factory.dur("quarter"),
      ),
    ]);

    const cmd = new AddPitchToChord("C", 4, "natural", 0);
    const result = cmd.execute(state);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "chord") {
      expect(evt.heads).toHaveLength(2);
    }
  });

  it("is a no-op on a rest", () => {
    const state = makeSnapshot([factory.rest(factory.dur("quarter"))]);

    const cmd = new AddPitchToChord("C", 4, "natural", 0);
    const result = cmd.execute(state);

    expect(result).toBe(state);
  });

  it("is a no-op when event index is out of range", () => {
    const state = makeSnapshot([factory.note("C", 4, factory.dur("quarter"))]);

    const cmd = new AddPitchToChord("E", 4, "natural", 5);
    const result = cmd.execute(state);

    expect(result).toBe(state);
  });

  it("preserves duration when converting note to chord", () => {
    const state = makeSnapshot([
      factory.note("C", 4, factory.dur("half", 1)),
    ]);

    const cmd = new AddPitchToChord("E", 4, "natural", 0);
    const result = cmd.execute(state);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.duration.type).toBe("half");
    expect(evt.duration.dots).toBe(1);
  });

  it("handles accidentals on added pitch", () => {
    const state = makeSnapshot([
      factory.note("C", 4, factory.dur("quarter")),
    ]);

    const cmd = new AddPitchToChord("F", 4, "sharp", 0);
    const result = cmd.execute(state);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "chord") {
      expect(evt.heads[1].pitch.accidental).toBe("sharp");
    }
  });
});
