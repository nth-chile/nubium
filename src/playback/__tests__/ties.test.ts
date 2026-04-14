import { describe, it, expect } from "vitest";
import { _buildEventsForTest } from "../TonePlayback";
import { factory } from "../../model";
import { TICKS_PER_QUARTER } from "../../model/duration";

/**
 * Tie handling in playback.
 *
 * A note whose head has tied=true should merge with the next same-pitch
 * note in the same voice into a single sustained PlayEvent: one note-on
 * at the first tick, duration = sum of both note durations.
 */

function tiedNote(pc: "C" | "D" | "E" | "F" | "G" | "A" | "B", oct: number, dur = factory.dur("quarter")) {
  const n = factory.note(pc, oct as Parameters<typeof factory.note>[1], dur);
  n.head.tied = true;
  return n;
}

describe("ties in playback", () => {
  it("merges a tied quarter+quarter into a single half-duration event", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            tiedNote("C", 4),
            factory.note("C", 4, factory.dur("quarter")),
            factory.note("D", 4, factory.dur("quarter")),
            factory.note("E", 4, factory.dur("quarter")),
          ]),
        ]),
      ]),
    ]);
    const evs = _buildEventsForTest(score);
    // Expect 3 note events: one C (merged, 2 quarters), one D, one E
    expect(evs.length).toBe(3);
    const c = evs[0];
    expect(c.midi).toBe(60); // C4
    expect(c.durationTicks).toBe(TICKS_PER_QUARTER * 2);
    expect(c.tick).toBe(0);
    expect(evs[1].midi).toBe(62); // D4
    expect(evs[1].tick).toBe(TICKS_PER_QUARTER * 2);
    expect(evs[2].midi).toBe(64); // E4
  });

  it("chains three tied notes into one event", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            tiedNote("C", 4),
            tiedNote("C", 4),
            factory.note("C", 4, factory.dur("quarter")),
            factory.note("D", 4, factory.dur("quarter")),
          ]),
        ]),
      ]),
    ]);
    const evs = _buildEventsForTest(score);
    expect(evs.length).toBe(2);
    expect(evs[0].midi).toBe(60);
    expect(evs[0].durationTicks).toBe(TICKS_PER_QUARTER * 3);
    expect(evs[1].midi).toBe(62);
    expect(evs[1].tick).toBe(TICKS_PER_QUARTER * 3);
  });

  it("does not merge when pitches differ (broken tie)", () => {
    // Tie on C but next note is D — should emit two separate events
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            tiedNote("C", 4),
            factory.note("D", 4, factory.dur("quarter")),
            factory.note("E", 4, factory.dur("quarter")),
            factory.note("F", 4, factory.dur("quarter")),
          ]),
        ]),
      ]),
    ]);
    const evs = _buildEventsForTest(score);
    expect(evs.length).toBe(4);
    expect(evs[0].durationTicks).toBe(TICKS_PER_QUARTER);
  });

  it("rest breaks a tie", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            tiedNote("C", 4),
            factory.rest(factory.dur("quarter")),
            factory.note("C", 4, factory.dur("quarter")),
            factory.note("D", 4, factory.dur("quarter")),
          ]),
        ]),
      ]),
    ]);
    const evs = _buildEventsForTest(score);
    // C at tick 0 (untouched), C at tick 960 (not merged — tie broken by rest), D
    expect(evs.length).toBe(3);
    expect(evs[0].midi).toBe(60);
    expect(evs[0].durationTicks).toBe(TICKS_PER_QUARTER);
    expect(evs[1].midi).toBe(60);
    expect(evs[1].tick).toBe(TICKS_PER_QUARTER * 2);
  });

  it("merges ties across measure boundaries", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            factory.note("C", 4, factory.dur("quarter")),
            factory.note("D", 4, factory.dur("quarter")),
            factory.note("E", 4, factory.dur("quarter")),
            tiedNote("F", 4),
          ]),
        ]),
        factory.measure([
          factory.voice([
            factory.note("F", 4, factory.dur("quarter")),
            factory.note("G", 4, factory.dur("quarter")),
            factory.note("A", 4, factory.dur("quarter")),
            factory.note("B", 4, factory.dur("quarter")),
          ]),
        ]),
      ]),
    ]);
    const evs = _buildEventsForTest(score);
    // Events: C, D, E, F(tied, extended to half), G, A, B = 7
    expect(evs.length).toBe(7);
    const f = evs.find((e) => e.midi === 65); // F4
    expect(f?.durationTicks).toBe(TICKS_PER_QUARTER * 2);
    expect(f?.tick).toBe(TICKS_PER_QUARTER * 3);
  });

  it("honors per-head ties in chords", () => {
    // Chord [C, E] with only C tied → next chord [C, E]:
    // C merges (half), E plays twice (quarter each)
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            factory.chord(
              [factory.noteHead("C", 4, "natural", true), factory.noteHead("E", 4)],
              factory.dur("quarter"),
            ),
            factory.chord(
              [factory.noteHead("C", 4), factory.noteHead("E", 4)],
              factory.dur("quarter"),
            ),
            factory.note("F", 4, factory.dur("half")),
          ]),
        ]),
      ]),
    ]);
    const evs = _buildEventsForTest(score);
    // Expected: C(tick 0, half), E(tick 0, quarter), E(tick 480, quarter), F(tick 960, half) = 4 events
    const cEvents = evs.filter((e) => e.midi === 60);
    const eEvents = evs.filter((e) => e.midi === 64);
    expect(cEvents.length).toBe(1);
    expect(cEvents[0].durationTicks).toBe(TICKS_PER_QUARTER * 2);
    expect(eEvents.length).toBe(2);
    expect(eEvents[0].durationTicks).toBe(TICKS_PER_QUARTER);
    expect(eEvents[1].durationTicks).toBe(TICKS_PER_QUARTER);
  });

  it("ties in different voices do not cross-contaminate", () => {
    // Voice 0: C tied → C. Voice 1: C (not tied). Voice 1's C must remain separate.
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            tiedNote("C", 4),
            factory.note("C", 4, factory.dur("quarter")),
            factory.rest(factory.dur("half")),
          ]),
          factory.voice([
            factory.note("C", 4, factory.dur("whole")),
          ]),
        ]),
      ]),
    ]);
    const evs = _buildEventsForTest(score);
    // Voice 0: one C (half, merged). Voice 1: one C (whole).
    const cEvents = evs.filter((e) => e.midi === 60);
    expect(cEvents.length).toBe(2);
    const durations = cEvents.map((e) => e.durationTicks).sort((a, b) => a - b);
    expect(durations).toEqual([TICKS_PER_QUARTER * 2, TICKS_PER_QUARTER * 4]);
  });
});
