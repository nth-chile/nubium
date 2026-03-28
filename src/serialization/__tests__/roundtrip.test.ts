import { describe, it, expect } from "vitest";
import { serialize } from "../serialize";
import { deserialize } from "../deserialize";
import { factory } from "../../model";
import { durationToTicks, voiceTicksUsed, measureCapacity } from "../../model/duration";

describe("serialization round-trip", () => {
  it("round-trips a simple score", () => {
    const s = factory.score("Test Song", "Test Composer", [
      factory.part("Piano", "Pno.", [
        factory.measure([
          factory.voice([
            factory.note("C", 4, factory.dur("quarter")),
            factory.note("D", 4, factory.dur("quarter")),
            factory.note("E", 4, factory.dur("quarter")),
            factory.note("F", 4, factory.dur("quarter")),
          ]),
        ]),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);

    expect(parsed.title).toBe("Test Song");
    expect(parsed.composer).toBe("Test Composer");
    expect(parsed.parts).toHaveLength(1);
    expect(parsed.parts[0].name).toBe("Piano");
    expect(parsed.parts[0].measures).toHaveLength(1);
    expect(parsed.parts[0].measures[0].voices[0].events).toHaveLength(4);

    const events = parsed.parts[0].measures[0].voices[0].events;
    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("C");
      expect(events[0].head.pitch.octave).toBe(4);
      expect(events[0].head.pitch.accidental).toBe("natural");
      expect(events[0].duration.type).toBe("quarter");
    }
  });

  it("round-trips chords", () => {
    const s = factory.score("Chords", "", [
      factory.part("Piano", "Pno.", [
        factory.measure([
          factory.voice([
            factory.chord(
              [
                factory.noteHead("C", 4),
                factory.noteHead("E", 4),
                factory.noteHead("G", 4),
              ],
              factory.dur("half")
            ),
            factory.rest(factory.dur("half")),
          ]),
        ]),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);

    const events = parsed.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("chord");
    if (events[0].kind === "chord") {
      expect(events[0].heads).toHaveLength(3);
      expect(events[0].duration.type).toBe("half");
    }
    expect(events[1].kind).toBe("rest");
  });

  it("round-trips dotted notes", () => {
    const s = factory.score("Dots", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            factory.note("A", 4, factory.dur("quarter", 1)),
            factory.note("B", 4, factory.dur("eighth")),
            factory.rest(factory.dur("half")),
          ]),
        ]),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);

    const events = parsed.parts[0].measures[0].voices[0].events;
    if (events[0].kind === "note") {
      expect(events[0].duration.dots).toBe(1);
    }
  });

  it("round-trips accidentals", () => {
    const s = factory.score("Accidentals", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            factory.note("F", 4, factory.dur("quarter"), "sharp"),
            factory.note("B", 4, factory.dur("quarter"), "flat"),
            factory.note("C", 4, factory.dur("quarter"), "double-sharp"),
            factory.note("D", 4, factory.dur("quarter"), "double-flat"),
          ]),
        ]),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);

    const events = parsed.parts[0].measures[0].voices[0].events;
    if (events[0].kind === "note") expect(events[0].head.pitch.accidental).toBe("sharp");
    if (events[1].kind === "note") expect(events[1].head.pitch.accidental).toBe("flat");
    if (events[2].kind === "note") expect(events[2].head.pitch.accidental).toBe("double-sharp");
    if (events[3].kind === "note") expect(events[3].head.pitch.accidental).toBe("double-flat");
  });

  it("round-trips multiple measures and voices", () => {
    const s = factory.score("Multi", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([factory.note("C", 4, factory.dur("whole"))]),
          factory.voice([factory.note("E", 3, factory.dur("whole"))]),
        ]),
        factory.measure([
          factory.voice([factory.rest(factory.dur("whole"))]),
        ]),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);

    expect(parsed.parts[0].measures).toHaveLength(2);
    expect(parsed.parts[0].measures[0].voices).toHaveLength(2);
    expect(parsed.parts[0].measures[1].voices).toHaveLength(1);
  });
});

describe("duration ticks", () => {
  it("calculates quarter note ticks", () => {
    expect(durationToTicks({ type: "quarter", dots: 0 })).toBe(480);
  });

  it("calculates dotted quarter ticks", () => {
    expect(durationToTicks({ type: "quarter", dots: 1 })).toBe(720);
  });

  it("calculates double-dotted half ticks", () => {
    expect(durationToTicks({ type: "half", dots: 2 })).toBe(960 + 480 + 240);
  });

  it("calculates voiceTicksUsed", () => {
    const events = [
      { duration: { type: "quarter" as const, dots: 0 as const } },
      { duration: { type: "quarter" as const, dots: 0 as const } },
      { duration: { type: "half" as const, dots: 0 as const } },
    ];
    expect(voiceTicksUsed(events)).toBe(480 + 480 + 960);
  });

  it("calculates measureCapacity for 4/4", () => {
    expect(measureCapacity(4, 4)).toBe(1920);
  });

  it("calculates measureCapacity for 3/4", () => {
    expect(measureCapacity(3, 4)).toBe(1440);
  });

  it("calculates measureCapacity for 6/8", () => {
    expect(measureCapacity(6, 8)).toBe(1440);
  });
});
