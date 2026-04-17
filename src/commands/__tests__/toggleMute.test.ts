import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { ToggleMute } from "../ToggleMute";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function snapWith(events: ReturnType<typeof factory.note>[], eventIndex = 0): EditorSnapshot {
  const input = defaultInputState();
  input.cursor.eventIndex = eventIndex;
  return {
    score: factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice(events)])]),
    ]),
    inputState: input,
  };
}

describe("ToggleMute", () => {
  it("adds muted=true on a note that wasn't muted", () => {
    const snap = snapWith([factory.note("C", 4, factory.dur("quarter"))]);
    const result = new ToggleMute().execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect("muted" in evt && evt.muted).toBe(true);
  });

  it("removes muted when toggling a muted note", () => {
    const snap = snapWith([factory.note("C", 4, factory.dur("quarter"))]);
    const first = new ToggleMute().execute(snap);
    const second = new ToggleMute().execute(first);
    const evt = second.score.parts[0].measures[0].voices[0].events[0];
    expect("muted" in evt && evt.muted).toBeFalsy();
  });

  it("works on chords", () => {
    const chord = factory.chord(
      [factory.noteHead("C", 4), factory.noteHead("E", 4), factory.noteHead("G", 4)],
      factory.dur("quarter"),
    );
    const snap = snapWith([chord as never]);
    const result = new ToggleMute().execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect("muted" in evt && evt.muted).toBe(true);
  });

  it("returns state unchanged for rests", () => {
    const rest = factory.rest(factory.dur("quarter"));
    const snap = snapWith([rest as never]);
    const result = new ToggleMute().execute(snap);
    expect(result).toBe(snap);
  });

  it("returns state unchanged for invalid cursor", () => {
    const snap = snapWith([factory.note("C", 4, factory.dur("quarter"))], 99);
    const result = new ToggleMute().execute(snap);
    expect(result).toBe(snap);
  });

  it("does not modify other notes", () => {
    const snap = snapWith([
      factory.note("C", 4, factory.dur("quarter")),
      factory.note("D", 4, factory.dur("quarter")),
    ]);
    const result = new ToggleMute().execute(snap);
    const events = result.score.parts[0].measures[0].voices[0].events;
    expect("muted" in events[0] && events[0].muted).toBe(true);
    expect("muted" in events[1] && events[1].muted).toBeFalsy();
  });
});
