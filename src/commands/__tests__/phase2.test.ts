import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { InsertNote } from "../InsertNote";
import { InsertRest } from "../InsertRest";
import { ChangePitch } from "../ChangePitch";
import { InsertMeasure } from "../InsertMeasure";
import { DeleteMeasure } from "../DeleteMeasure";
import { ChangeDuration } from "../ChangeDuration";
import { ChangeTimeSig } from "../ChangeTimeSig";
import { ChangeKeySig } from "../ChangeKeySig";
import { ChangeClef } from "../ChangeClef";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(overrides?: {
  measures?: ReturnType<typeof factory.measure>[];
  cursor?: Partial<ReturnType<typeof defaultInputState>["cursor"]>;
}): EditorSnapshot {
  const measures = overrides?.measures ?? [
    factory.measure([factory.voice([])]),
    factory.measure([factory.voice([])]),
  ];
  const input = defaultInputState();
  if (overrides?.cursor) {
    Object.assign(input.cursor, overrides.cursor);
  }
  return {
    score: factory.score("Test", "", [factory.part("P", "P", measures)]),
    inputState: input,
  };
}

describe("Measure Capacity Enforcement", () => {
  it("auto-advances to next measure when current is full", () => {
    // Fill a 4/4 measure with 4 quarter notes
    const m1 = factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.note("D", 4, factory.dur("quarter")),
        factory.note("E", 4, factory.dur("quarter")),
        factory.note("F", 4, factory.dur("quarter")),
      ]),
    ]);
    const m2 = factory.measure([factory.voice([])]);

    const snap = makeSnapshot({
      measures: [m1, m2],
      cursor: { measureIndex: 0, eventIndex: 4 },
    });

    // Try to insert another quarter note — should auto-advance
    const cmd = new InsertNote("G", 4, "natural", factory.dur("quarter"));
    const result = cmd.execute(snap);

    // Cursor should be in measure 1, eventIndex 1
    expect(result.inputState.cursor.measureIndex).toBe(1);
    expect(result.inputState.cursor.eventIndex).toBe(1);

    // The note should be in measure 1's voice
    const voice = result.score.parts[0].measures[1].voices[0];
    expect(voice.events).toHaveLength(1);
    expect(voice.events[0].kind).toBe("note");
    if (voice.events[0].kind === "note") {
      expect(voice.events[0].head.pitch.pitchClass).toBe("G");
    }
  });

  it("inserts normally when measure has capacity", () => {
    const snap = makeSnapshot();

    const cmd = new InsertNote("C", 4, "natural", factory.dur("quarter"));
    const result = cmd.execute(snap);

    expect(result.inputState.cursor.measureIndex).toBe(0);
    expect(result.inputState.cursor.eventIndex).toBe(1);
    expect(result.score.parts[0].measures[0].voices[0].events).toHaveLength(1);
  });

  it("auto-advances rest insertion when measure is full", () => {
    const m1 = factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("whole")),
      ]),
    ]);
    const m2 = factory.measure([factory.voice([])]);

    const snap = makeSnapshot({
      measures: [m1, m2],
      cursor: { measureIndex: 0, eventIndex: 1 },
    });

    const cmd = new InsertRest(factory.dur("quarter"));
    const result = cmd.execute(snap);

    expect(result.inputState.cursor.measureIndex).toBe(1);
    expect(result.score.parts[0].measures[1].voices[0].events).toHaveLength(1);
    expect(result.score.parts[0].measures[1].voices[0].events[0].kind).toBe("rest");
  });
});

describe("ChangePitch", () => {
  it("changes pitch of an existing note", () => {
    const m = factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.note("D", 4, factory.dur("quarter")),
      ]),
    ]);

    const snap = makeSnapshot({
      measures: [m],
      cursor: { measureIndex: 0, eventIndex: 0 },
    });

    const cmd = new ChangePitch("E", 5, "sharp");
    const result = cmd.execute(snap);

    const event = result.score.parts[0].measures[0].voices[0].events[0];
    expect(event.kind).toBe("note");
    if (event.kind === "note") {
      expect(event.head.pitch.pitchClass).toBe("E");
      expect(event.head.pitch.octave).toBe(5);
      expect(event.head.pitch.accidental).toBe("sharp");
    }
  });

  it("does nothing when cursor is past end", () => {
    const m = factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
      ]),
    ]);

    const snap = makeSnapshot({
      measures: [m],
      cursor: { measureIndex: 0, eventIndex: 1 },
    });

    const cmd = new ChangePitch("E", 5, "natural");
    const result = cmd.execute(snap);

    const event = result.score.parts[0].measures[0].voices[0].events[0];
    if (event.kind === "note") {
      expect(event.head.pitch.pitchClass).toBe("C");
    }
  });

  it("does nothing for rests", () => {
    const m = factory.measure([
      factory.voice([factory.rest(factory.dur("quarter"))]),
    ]);

    const snap = makeSnapshot({
      measures: [m],
      cursor: { measureIndex: 0, eventIndex: 0 },
    });

    const cmd = new ChangePitch("E", 5, "natural");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures[0].voices[0].events[0].kind).toBe("rest");
  });
});

describe("ChangeDuration", () => {
  it("changes duration of an existing event", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);

    const snap = makeSnapshot({
      measures: [m],
      cursor: { measureIndex: 0, eventIndex: 0 },
    });

    const cmd = new ChangeDuration(factory.dur("half", 1));
    const result = cmd.execute(snap);

    const event = result.score.parts[0].measures[0].voices[0].events[0];
    expect(event.duration.type).toBe("half");
    expect(event.duration.dots).toBe(1);
  });
});

describe("InsertMeasure", () => {
  it("inserts a new measure after current", () => {
    const snap = makeSnapshot();

    const cmd = new InsertMeasure();
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures).toHaveLength(3);
    expect(result.inputState.cursor.measureIndex).toBe(1);
    expect(result.inputState.cursor.eventIndex).toBe(0);
  });

  it("copies time signature from current measure", () => {
    const m1 = factory.measure([factory.voice([])], {
      timeSignature: { numerator: 3, denominator: 4 },
    });
    const m2 = factory.measure([factory.voice([])]);

    const snap = makeSnapshot({ measures: [m1, m2] });

    const cmd = new InsertMeasure();
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures[1].timeSignature).toEqual({
      numerator: 3,
      denominator: 4,
    });
  });
});

describe("DeleteMeasure", () => {
  it("deletes an empty measure", () => {
    const snap = makeSnapshot();
    expect(snap.score.parts[0].measures).toHaveLength(2);

    const cmd = new DeleteMeasure();
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures).toHaveLength(1);
  });

  it("does not delete a non-empty measure", () => {
    const m1 = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const m2 = factory.measure([factory.voice([])]);

    const snap = makeSnapshot({
      measures: [m1, m2],
      cursor: { measureIndex: 0 },
    });

    const cmd = new DeleteMeasure();
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures).toHaveLength(2);
  });

  it("does not delete the last remaining measure", () => {
    const m = factory.measure([factory.voice([])]);
    const snap = makeSnapshot({ measures: [m] });

    const cmd = new DeleteMeasure();
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures).toHaveLength(1);
  });
});

describe("ChangeTimeSig", () => {
  it("changes time signature of current measure", () => {
    const snap = makeSnapshot();

    const cmd = new ChangeTimeSig({ numerator: 6, denominator: 8 });
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures[0].timeSignature).toEqual({
      numerator: 6,
      denominator: 8,
    });
  });
});

describe("ChangeKeySig", () => {
  it("changes key signature of current measure", () => {
    const snap = makeSnapshot();

    const cmd = new ChangeKeySig({ fifths: 3 });
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures[0].keySignature).toEqual({ fifths: 3 });
  });
});

describe("ChangeClef", () => {
  it("changes clef of current measure", () => {
    const snap = makeSnapshot();

    const cmd = new ChangeClef({ type: "bass" });
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures[0].clef).toEqual({ type: "bass" });
  });
});
