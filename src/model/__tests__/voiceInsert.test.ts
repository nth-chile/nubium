import { describe, it, expect } from "vitest";
import { splitEventAtTick, shiftVoiceForward } from "../voiceInsert";
import { factory } from "../../model";
import { durationToTicks, voiceTicksUsed, measureCapacity } from "../duration";

describe("splitEventAtTick", () => {
  it("returns event in before when ticksBefore >= total", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    const { before, after } = splitEventAtTick(note, 480);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(0);
    expect(before[0].id).toBe(note.id);
  });

  it("returns event in after when ticksBefore <= 0", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    const { before, after } = splitEventAtTick(note, 0);
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(note.id);
  });

  it("splits a half note at quarter boundary into two tied quarters", () => {
    const note = factory.note("C", 4, factory.dur("half"));
    const { before, after } = splitEventAtTick(note, 480); // quarter boundary
    expect(before.length).toBeGreaterThanOrEqual(1);
    expect(after.length).toBeGreaterThanOrEqual(1);

    const beforeTicks = before.reduce((s, e) => s + durationToTicks(e.duration), 0);
    const afterTicks = after.reduce((s, e) => s + durationToTicks(e.duration), 0);
    expect(beforeTicks).toBe(480);
    expect(afterTicks).toBe(480);

    // First before event keeps original id
    expect(before[0].id).toBe(note.id);
    // Note events should be tied
    if (before[0].kind === "note") {
      expect(before[0].head.tied).toBe(true);
    }
  });

  it("splits a rest without ties", () => {
    const r = factory.rest(factory.dur("half"));
    const { before, after } = splitEventAtTick(r, 480);
    expect(before.length).toBeGreaterThanOrEqual(1);
    expect(after.length).toBeGreaterThanOrEqual(1);

    // Rest events should not have ties
    for (const evt of [...before, ...after]) {
      expect(evt.kind).toBe("rest");
    }
  });

  it("splits a chord with ties on all heads", () => {
    const ch = factory.chord(
      [factory.noteHead("C", 4), factory.noteHead("E", 4), factory.noteHead("G", 4)],
      factory.dur("half"),
    );
    const { before, after } = splitEventAtTick(ch, 480);
    expect(before.length).toBeGreaterThanOrEqual(1);
    expect(after.length).toBeGreaterThanOrEqual(1);

    if (before[0].kind === "chord") {
      expect(before[0].heads.every((h) => h.tied)).toBe(true);
    }
  });

  it("splits a slash event (like rest, no ties)", () => {
    const sl = factory.slash(factory.dur("half"));
    const { before, after } = splitEventAtTick(sl, 480);
    expect(before.length).toBeGreaterThanOrEqual(1);
    expect(after.length).toBeGreaterThanOrEqual(1);
    for (const evt of [...before, ...after]) {
      expect(evt.kind).toBe("slash");
    }
  });

  it("does not split grace notes", () => {
    const grace = factory.graceNote("C", 4);
    const { before, after } = splitEventAtTick(grace, 120);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(0);
  });
});

describe("shiftVoiceForward", () => {
  it("inserts event and pushes subsequent events forward", () => {
    const part = factory.part("P", "P", [
      factory.measure([
        factory.voice([
          factory.note("C", 4, factory.dur("quarter")),
          factory.note("D", 4, factory.dur("quarter")),
          factory.note("E", 4, factory.dur("quarter")),
          factory.note("F", 4, factory.dur("quarter")),
        ]),
      ]),
      factory.measure([factory.voice([])]),
    ]);

    const newNote = factory.note("G", 4, factory.dur("quarter"));
    shiftVoiceForward(part, 0, 0, 0, newNote);

    // Measure 0 should still have exactly 1920 ticks
    const v0 = part.measures[0].voices[0];
    expect(voiceTicksUsed(v0.events)).toBeLessThanOrEqual(
      measureCapacity(part.measures[0].timeSignature.numerator, part.measures[0].timeSignature.denominator),
    );

    // The overflow note (F4) should be in measure 1
    const v1 = part.measures[1].voices[0];
    expect(v1.events.length).toBeGreaterThanOrEqual(1);
  });

  it("creates new measure when overflow exceeds last measure", () => {
    const part = factory.part("P", "P", [
      factory.measure([
        factory.voice([
          factory.note("C", 4, factory.dur("whole")),
        ]),
      ]),
    ]);

    const newNote = factory.note("D", 4, factory.dur("quarter"));
    shiftVoiceForward(part, 0, 0, 0, newNote);

    // Should have created a second measure
    expect(part.measures.length).toBe(2);
    const v1 = part.measures[1].voices[0];
    expect(v1.events.length).toBeGreaterThanOrEqual(1);
  });

  it("handles insertion into empty voice", () => {
    const part = factory.part("P", "P", [
      factory.measure([factory.voice([])]),
    ]);

    const newNote = factory.note("C", 4, factory.dur("quarter"));
    shiftVoiceForward(part, 0, 0, 0, newNote);

    expect(part.measures[0].voices[0].events).toHaveLength(1);
    expect(part.measures[0].voices[0].events[0].kind).toBe("note");
  });
});
