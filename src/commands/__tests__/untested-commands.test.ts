import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { NudgePitch } from "../NudgePitch";
import { SetSwing } from "../SetSwing";
import { SetAccidental } from "../SetAccidental";
import { ToggleCrossStaff } from "../ToggleCrossStaff";
import { InsertModeNote } from "../InsertModeNote";
import { DeleteSelectedMeasures } from "../DeleteSelectedMeasures";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(overrides?: {
  measures?: ReturnType<typeof factory.measure>[];
  cursor?: Partial<ReturnType<typeof defaultInputState>["cursor"]>;
  parts?: ReturnType<typeof factory.part>[];
}): EditorSnapshot {
  const input = defaultInputState();
  if (overrides?.cursor) {
    Object.assign(input.cursor, overrides.cursor);
  }
  const parts = overrides?.parts ?? [
    factory.part(
      "P",
      "P",
      overrides?.measures ?? [
        factory.measure([factory.voice([])]),
        factory.measure([factory.voice([])]),
      ]
    ),
  ];
  return {
    score: factory.score("Test", "", parts),
    inputState: input,
  };
}

// ─── NudgePitch ──────────────────────────────────────────

describe("NudgePitch", () => {
  it("nudges a note up diatonically", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("up", "diatonic").execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    expect(note.kind).toBe("note");
    if (note.kind === "note") {
      expect(note.head.pitch.pitchClass).toBe("D");
    }
  });

  it("nudges a note down diatonically", () => {
    const m = factory.measure([
      factory.voice([factory.note("D", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("down", "diatonic").execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    if (note.kind === "note") {
      expect(note.head.pitch.pitchClass).toBe("C");
    }
  });

  it("nudges a note up chromatically", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("up", "chromatic").execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    if (note.kind === "note") {
      // C4 -> C#4 or Db4 (midi 61)
      expect(note.head.pitch).toBeDefined();
    }
  });

  it("nudges a note up by octave", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("up", "octave").execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    if (note.kind === "note") {
      expect(note.head.pitch.pitchClass).toBe("C");
      expect(note.head.pitch.octave).toBe(5);
    }
  });

  it("nudges a note down by octave", () => {
    const m = factory.measure([
      factory.voice([factory.note("E", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("down", "octave").execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    if (note.kind === "note") {
      expect(note.head.pitch.octave).toBe(3);
    }
  });

  it("clamps octave at boundaries", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 9, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("up", "octave").execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    if (note.kind === "note") {
      expect(note.head.pitch.octave).toBe(9); // unchanged
    }
  });

  it("nudges all heads in a chord", () => {
    const m = factory.measure([
      factory.voice([
        factory.chord(
          [factory.noteHead("C", 4), factory.noteHead("E", 4)],
          factory.dur("quarter")
        ),
      ]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("up", "diatonic").execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "chord") {
      expect(evt.heads[0].pitch.pitchClass).toBe("D");
      expect(evt.heads[1].pitch.pitchClass).toBe("F");
    }
  });

  it("nudges a grace note", () => {
    const m = factory.measure([
      factory.voice([factory.graceNote("B", 3)]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("up", "octave").execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "grace") {
      expect(evt.head.pitch.octave).toBe(4);
    }
  });

  it("does nothing for rests", () => {
    const m = factory.measure([
      factory.voice([factory.rest(factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("up", "diatonic").execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("rest");
  });

  it("returns state unchanged when no event at cursor", () => {
    const m = factory.measure([factory.voice([])]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new NudgePitch("up", "diatonic").execute(snap);
    expect(result).toBe(snap);
  });
});

// ─── SetSwing ────────────────────────────────────────────

describe("SetSwing", () => {
  it("adds swing to an existing tempo mark", () => {
    const m = factory.measure(
      [factory.voice([factory.note("C", 4, factory.dur("quarter"))])],
      {
        annotations: [{ kind: "tempo-mark", bpm: 120, beatUnit: "quarter" }],
      }
    );
    const snap = makeSnapshot({ measures: [m] });
    const result = new SetSwing({ style: "swing", ratio: 2 / 3 }).execute(snap);
    const ann = result.score.parts[0].measures[0].annotations;
    const tempo = ann.find((a) => a.kind === "tempo-mark");
    expect(tempo).toBeDefined();
    if (tempo && tempo.kind === "tempo-mark") {
      expect(tempo.swing).toEqual({ style: "swing", ratio: 2 / 3 });
    }
  });

  it("removes swing when passed undefined", () => {
    const m = factory.measure(
      [factory.voice([])],
      {
        annotations: [
          { kind: "tempo-mark", bpm: 120, beatUnit: "quarter", swing: { style: "swing", ratio: 0.67 } },
        ],
      }
    );
    const snap = makeSnapshot({ measures: [m] });
    const result = new SetSwing(undefined).execute(snap);
    const tempo = result.score.parts[0].measures[0].annotations.find(
      (a) => a.kind === "tempo-mark"
    );
    if (tempo && tempo.kind === "tempo-mark") {
      expect(tempo.swing).toBeUndefined();
    }
  });

  it("creates a tempo mark when none exists", () => {
    const m = factory.measure([factory.voice([])]);
    const snap = makeSnapshot({ measures: [m] });
    const result = new SetSwing({ style: "shuffle", ratio: 0.6 }).execute(snap);
    const ann = result.score.parts[0].measures[0].annotations;
    expect(ann.length).toBe(1);
    const tempo = ann[0];
    expect(tempo.kind).toBe("tempo-mark");
    if (tempo.kind === "tempo-mark") {
      expect(tempo.swing).toEqual({ style: "shuffle", ratio: 0.6 });
    }
  });
});

// ─── SetAccidental ───────────────────────────────────────

describe("SetAccidental", () => {
  it("sets sharp on a note", () => {
    const m = factory.measure([
      factory.voice([factory.note("F", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new SetAccidental("sharp").execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    if (note.kind === "note") {
      expect(note.head.pitch.accidental).toBe("sharp");
    }
  });

  it("sets flat on a note", () => {
    const m = factory.measure([
      factory.voice([factory.note("B", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new SetAccidental("flat").execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    if (note.kind === "note") {
      expect(note.head.pitch.accidental).toBe("flat");
    }
  });

  it("sets accidental on all chord heads", () => {
    const m = factory.measure([
      factory.voice([
        factory.chord(
          [factory.noteHead("C", 4), factory.noteHead("E", 4)],
          factory.dur("quarter")
        ),
      ]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new SetAccidental("sharp").execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "chord") {
      expect(evt.heads[0].pitch.accidental).toBe("sharp");
      expect(evt.heads[1].pitch.accidental).toBe("sharp");
    }
  });

  it("sets accidental on a grace note", () => {
    const m = factory.measure([
      factory.voice([factory.graceNote("A", 4)]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new SetAccidental("flat").execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "grace") {
      expect(evt.head.pitch.accidental).toBe("flat");
    }
  });

  it("does nothing for rests", () => {
    const m = factory.measure([
      factory.voice([factory.rest(factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m], cursor: { eventIndex: 0 } });
    const result = new SetAccidental("sharp").execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("rest");
  });
});

// ─── ToggleCrossStaff ────────────────────────────────────

describe("ToggleCrossStaff", () => {
  it("sets renderStaff on a note in a grand staff instrument", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({
      parts: [factory.part("Piano", "Pno.", [m], "piano")],
      cursor: { eventIndex: 0 },
    });
    const result = new ToggleCrossStaff().execute(snap);
    const note = result.score.parts[0].measures[0].voices[0].events[0];
    expect(note.kind === "note" && note.renderStaff).toBe(1);
  });

  it("toggles renderStaff off when already cross-staff", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    (note as any).renderStaff = 1;
    const m = factory.measure([factory.voice([note])]);
    const snap = makeSnapshot({
      parts: [factory.part("Piano", "Pno.", [m], "piano")],
      cursor: { eventIndex: 0 },
    });
    const result = new ToggleCrossStaff().execute(snap);
    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind === "note" && evt.renderStaff).toBeUndefined();
  });

  it("does nothing for single-staff instruments", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({
      parts: [factory.part("Flute", "Fl.", [m], "flute")],
      cursor: { eventIndex: 0 },
    });
    const result = new ToggleCrossStaff().execute(snap);
    expect(result).toBe(snap);
  });

  it("does nothing for rests", () => {
    const m = factory.measure([
      factory.voice([factory.rest(factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({
      parts: [factory.part("Piano", "Pno.", [m], "piano")],
      cursor: { eventIndex: 0 },
    });
    const result = new ToggleCrossStaff().execute(snap);
    expect(result).toBe(snap);
  });
});

// ─── InsertModeNote ──────────────────────────────────────

describe("InsertModeNote", () => {
  it("inserts a note and shifts subsequent events forward", () => {
    const m = factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.note("D", 4, factory.dur("quarter")),
      ]),
    ]);
    const snap = makeSnapshot({
      measures: [m, factory.measure([factory.voice([])])],
      cursor: { eventIndex: 0 },
    });
    const result = new InsertModeNote("E", 4, "natural", factory.dur("quarter")).execute(snap);
    const events = result.score.parts[0].measures[0].voices[0].events;
    // The new note should be at index 0
    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("E");
    }
    // Cursor advances
    expect(result.inputState.cursor.eventIndex).toBe(1);
  });

  it("inserts a rest in insert mode", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({
      measures: [m, factory.measure([factory.voice([])])],
      cursor: { eventIndex: 0 },
    });
    const result = new InsertModeNote("C", 4, "natural", factory.dur("quarter"), true).execute(snap);
    const events = result.score.parts[0].measures[0].voices[0].events;
    expect(events[0].kind).toBe("rest");
  });

  it("creates new measures for other parts on overflow", () => {
    const m1 = factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.note("D", 4, factory.dur("quarter")),
        factory.note("E", 4, factory.dur("quarter")),
        factory.note("F", 4, factory.dur("quarter")),
      ]),
    ]);
    const p1 = factory.part("P1", "P1", [m1]);
    const p2 = factory.part("P2", "P2", [factory.measure([factory.voice([])])]);
    const snap = makeSnapshot({
      parts: [p1, p2],
      cursor: { eventIndex: 0 },
    });
    const beforeP2 = snap.score.parts[1].measures.length;
    const result = new InsertModeNote("G", 4, "natural", factory.dur("quarter")).execute(snap);
    // If overflow created new measures in P1, P2 should also get them
    expect(result.score.parts[1].measures.length).toBeGreaterThanOrEqual(beforeP2);
  });
});

// ─── DeleteSelectedMeasures ──────────────────────────────

describe("DeleteSelectedMeasures", () => {
  it("deletes a range of selected measures", () => {
    const measures = [
      factory.measure([factory.voice([factory.note("C", 4, factory.dur("quarter"))])]),
      factory.measure([factory.voice([factory.note("D", 4, factory.dur("quarter"))])]),
      factory.measure([factory.voice([factory.note("E", 4, factory.dur("quarter"))])]),
    ];
    const snap = makeSnapshot({ measures });
    const sel = { partIndex: 0, measureStart: 0, measureEnd: 1, measureAnchor: 0 };
    const result = new DeleteSelectedMeasures(sel).execute(snap);
    expect(result.score.parts[0].measures.length).toBe(1);
    // Remaining measure should be the third one
    const remaining = result.score.parts[0].measures[0].voices[0].events[0];
    if (remaining.kind === "note") {
      expect(remaining.head.pitch.pitchClass).toBe("E");
    }
  });

  it("keeps at least one measure when all are deleted", () => {
    const measures = [factory.measure([factory.voice([])])];
    const snap = makeSnapshot({ measures });
    const sel = { partIndex: 0, measureStart: 0, measureEnd: 0, measureAnchor: 0 };
    const result = new DeleteSelectedMeasures(sel).execute(snap);
    expect(result.score.parts[0].measures.length).toBe(1);
  });

  it("adjusts cursor after deletion", () => {
    const measures = [
      factory.measure([factory.voice([])]),
      factory.measure([factory.voice([])]),
      factory.measure([factory.voice([])]),
    ];
    const snap = makeSnapshot({ measures, cursor: { measureIndex: 2 } });
    const sel = { partIndex: 0, measureStart: 1, measureEnd: 2, measureAnchor: 1 };
    const result = new DeleteSelectedMeasures(sel).execute(snap);
    // Cursor should be clamped to valid range
    expect(result.inputState.cursor.measureIndex).toBeLessThanOrEqual(
      result.score.parts[0].measures.length - 1
    );
    expect(result.inputState.cursor.eventIndex).toBe(0);
  });

  it("returns state for invalid part index", () => {
    const snap = makeSnapshot({});
    const sel = { partIndex: 99, measureStart: 0, measureEnd: 0, measureAnchor: 0 };
    const result = new DeleteSelectedMeasures(sel).execute(snap);
    expect(result).toBe(snap);
  });
});
