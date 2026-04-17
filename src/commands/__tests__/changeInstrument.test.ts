import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { ChangeInstrument } from "../ChangeInstrument";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(overrides?: {
  measures?: ReturnType<typeof factory.measure>[];
  instrumentId?: string;
  partName?: string;
  partAbbrev?: string;
  cursor?: Partial<ReturnType<typeof defaultInputState>["cursor"]>;
}): EditorSnapshot {
  const measures = overrides?.measures ?? [
    factory.measure([factory.voice([factory.note("C", 4, factory.dur("quarter"))])]),
  ];
  const p = factory.part(
    overrides?.partName ?? "Piano",
    overrides?.partAbbrev ?? "Pno.",
    measures,
    overrides?.instrumentId ?? "piano",
  );
  const input = defaultInputState();
  if (overrides?.cursor) {
    Object.assign(input.cursor, overrides.cursor);
  }
  return {
    score: factory.score("Test", "", [p]),
    inputState: input,
  };
}

describe("ChangeInstrument", () => {
  it("updates the instrument id on the part", () => {
    const snap = makeSnapshot();
    const cmd = new ChangeInstrument(0, "violin");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].instrumentId).toBe("violin");
  });

  it("updates part name and abbreviation when they match old instrument defaults", () => {
    const snap = makeSnapshot();
    const cmd = new ChangeInstrument(0, "flute");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].name).toBe("Flute");
    expect(result.score.parts[0].abbreviation).toBe("Fl.");
  });

  it("preserves custom part name when it differs from old instrument default", () => {
    const snap = makeSnapshot({ partName: "Lead", partAbbrev: "Ld." });
    const cmd = new ChangeInstrument(0, "flute");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].name).toBe("Lead");
    expect(result.score.parts[0].abbreviation).toBe("Ld.");
  });

  it("changes clef on all measures to new instrument clef", () => {
    const snap = makeSnapshot({
      measures: [
        factory.measure([factory.voice([factory.note("C", 4, factory.dur("quarter"))])]),
        factory.measure([factory.voice([factory.note("D", 4, factory.dur("quarter"))])]),
      ],
    });
    const cmd = new ChangeInstrument(0, "bass");
    const result = cmd.execute(snap);

    for (const m of result.score.parts[0].measures) {
      expect(m.clef.type).toBe("bass");
    }
  });

  it("transposes notes when switching between transposing instruments", () => {
    // Piano (transposition 0) → Clarinet (transposition -2)
    // pitchShift = 0 - (-2) = 2, so notes go up 2 semitones
    const snap = makeSnapshot({
      measures: [
        factory.measure([factory.voice([factory.note("C", 4, factory.dur("quarter"))])]),
      ],
    });
    const cmd = new ChangeInstrument(0, "clarinet");
    const result = cmd.execute(snap);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      // C4 + 2 semitones = D4
      expect(evt.head.pitch.pitchClass).toBe("D");
      expect(evt.head.pitch.octave).toBe(4);
    }
  });

  it("does not transpose when both instruments have the same transposition", () => {
    const snap = makeSnapshot();
    const cmd = new ChangeInstrument(0, "violin");
    const result = cmd.execute(snap);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      expect(evt.head.pitch.pitchClass).toBe("C");
      expect(evt.head.pitch.octave).toBe(4);
    }
  });

  it("transposes chord events", () => {
    const snap = makeSnapshot({
      measures: [
        factory.measure([
          factory.voice([
            factory.chord(
              [factory.noteHead("C", 4), factory.noteHead("E", 4), factory.noteHead("G", 4)],
              factory.dur("half"),
            ),
          ]),
        ]),
      ],
    });
    const cmd = new ChangeInstrument(0, "clarinet");
    const result = cmd.execute(snap);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("chord");
    if (evt.kind === "chord") {
      // Each pitch shifted up by 2 semitones
      expect(evt.heads[0].pitch.pitchClass).toBe("D");
      expect(evt.heads[1].pitch.pitchClass).toBe("F");
      expect(evt.heads[2].pitch.pitchClass).toBe("A");
    }
  });

  it("clears guitar-specific fields when switching away from guitar", () => {
    const snap = makeSnapshot({ instrumentId: "guitar" });
    const part = snap.score.parts[0];
    part.tuning = { name: "Standard", strings: [40, 45, 50, 55, 59, 64] };
    part.capo = 2;

    const cmd = new ChangeInstrument(0, "violin");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].tuning).toBeUndefined();
    expect(result.score.parts[0].capo).toBeUndefined();
  });

  it("collapses grand staff voices when going from multi-staff to single-staff", () => {
    // Piano has staves: 2, violin has staves: 1
    const v = factory.voice([factory.note("C", 4, factory.dur("quarter"))]);
    (v as any).staff = 1;
    const snap = makeSnapshot({
      measures: [factory.measure([v])],
    });
    const cmd = new ChangeInstrument(0, "violin");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures[0].voices[0].staff).toBeUndefined();
  });

  it("returns state unchanged for invalid part index", () => {
    const snap = makeSnapshot();
    const cmd = new ChangeInstrument(5, "violin");
    const result = cmd.execute(snap);

    expect(result).toBe(snap);
  });

  it("returns state unchanged for unknown instrument id", () => {
    const snap = makeSnapshot();
    const cmd = new ChangeInstrument(0, "nonexistent");
    const result = cmd.execute(snap);

    expect(result).toBe(snap);
  });
});
