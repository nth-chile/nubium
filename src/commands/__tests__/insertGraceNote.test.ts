import { describe, it, expect } from "vitest";
import { InsertGraceNote } from "../InsertGraceNote";
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

describe("InsertGraceNote", () => {
  it("inserts a grace note before the event at cursor", () => {
    const state = makeSnapshot([
      factory.note("D", 4, factory.dur("quarter")),
    ]);

    const cmd = new InsertGraceNote("C", 4, "natural");
    const result = cmd.execute(state);

    const events = result.score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("grace");
    if (events[0].kind === "grace") {
      expect(events[0].head.pitch.pitchClass).toBe("C");
      expect(events[0].head.pitch.octave).toBe(4);
      expect(events[0].slash).toBe(true);
      expect(events[0].duration.type).toBe("eighth");
    }
    expect(events[1].kind).toBe("note");
  });

  it("advances cursor past the grace note", () => {
    const state = makeSnapshot([
      factory.note("D", 4, factory.dur("quarter")),
    ]);

    const cmd = new InsertGraceNote("C", 4, "natural");
    const result = cmd.execute(state);

    expect(result.inputState.cursor.eventIndex).toBe(1);
  });

  it("inserts appoggiatura (slash=false)", () => {
    const state = makeSnapshot([
      factory.note("D", 4, factory.dur("quarter")),
    ]);

    const cmd = new InsertGraceNote("C", 4, "natural", false);
    const result = cmd.execute(state);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "grace") {
      expect(evt.slash).toBe(false);
    }
  });

  it("handles accidentals", () => {
    const state = makeSnapshot([
      factory.note("D", 4, factory.dur("quarter")),
    ]);

    const cmd = new InsertGraceNote("F", 4, "sharp");
    const result = cmd.execute(state);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "grace") {
      expect(evt.head.pitch.pitchClass).toBe("F");
      expect(evt.head.pitch.accidental).toBe("sharp");
    }
  });

  it("is a no-op when voice does not exist", () => {
    const state = makeSnapshot([]);
    state.inputState.cursor.voiceIndex = 5; // nonexistent

    const cmd = new InsertGraceNote("C", 4, "natural");
    const result = cmd.execute(state);

    expect(result).toBe(state);
  });
});
