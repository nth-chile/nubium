import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { OverwriteNote } from "../OverwriteNote";
import { SetDynamic } from "../SetDynamic";
import { TogglePickup } from "../TogglePickup";
import { InsertGraceNote } from "../InsertGraceNote";
import { SetSlur } from "../SetSlur";
import { DeleteNote } from "../DeleteNote";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";
import type { NoteEventId } from "../../model/ids";

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

describe("OverwriteNote", () => {
  it("overwrites an existing event at cursor", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });
    const cmd = new OverwriteNote("D", 4, "natural", factory.dur("half"));
    const result = cmd.execute(snap);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      expect(evt.head.pitch.pitchClass).toBe("D");
      expect(evt.duration.type).toBe("half");
    }
    expect(result.inputState.cursor.eventIndex).toBe(1);
  });

  it("inserts when cursor is past end", () => {
    const snap = makeSnapshot();
    const cmd = new OverwriteNote("E", 4, "natural", factory.dur("quarter"));
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures[0].voices[0].events).toHaveLength(1);
    expect(result.inputState.cursor.eventIndex).toBe(1);
  });
});

describe("SetDynamic", () => {
  it("adds a dynamic marking to a measure", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    const m = factory.measure([factory.voice([note])]);
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });
    const cmd = new SetDynamic("ff", note.id);
    const result = cmd.execute(snap);

    const dynamics = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "dynamic",
    );
    expect(dynamics).toHaveLength(1);
    if (dynamics[0].kind === "dynamic") {
      expect(dynamics[0].level).toBe("ff");
      expect(dynamics[0].noteEventId).toBe(note.id);
    }
  });

  it("replaces existing dynamic on same event", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    const m = factory.measure([factory.voice([note])]);
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });
    const r1 = new SetDynamic("p", note.id).execute(snap);
    const r2 = new SetDynamic("ff", note.id).execute(r1);

    const dynamics = r2.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "dynamic",
    );
    expect(dynamics).toHaveLength(1);
    if (dynamics[0].kind === "dynamic") {
      expect(dynamics[0].level).toBe("ff");
    }
  });

  it("removes dynamic when level is null", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    const m = factory.measure([factory.voice([note])]);
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });
    const r1 = new SetDynamic("p", note.id).execute(snap);
    const r2 = new SetDynamic(null, note.id).execute(r1);

    const dynamics = r2.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "dynamic",
    );
    expect(dynamics).toHaveLength(0);
  });
});

describe("TogglePickup", () => {
  it("marks measure as pickup", () => {
    const snap = makeSnapshot();
    const cmd = new TogglePickup();
    const result = cmd.execute(snap);
    expect(result.score.parts[0].measures[0].isPickup).toBe(true);
  });

  it("toggles pickup off", () => {
    const snap = makeSnapshot();
    const r1 = new TogglePickup().execute(snap);
    const r2 = new TogglePickup().execute(r1);
    expect(r2.score.parts[0].measures[0].isPickup).toBeFalsy();
  });

  it("applies to all parts", () => {
    const input = defaultInputState();
    const score = factory.score("Test", "", [
      factory.part("P1", "P1", [factory.measure([factory.voice([])]), factory.measure([factory.voice([])])]),
      factory.part("P2", "P2", [factory.measure([factory.voice([])]), factory.measure([factory.voice([])])]),
    ]);
    const snap: EditorSnapshot = { score, inputState: input };
    const result = new TogglePickup().execute(snap);
    expect(result.score.parts[0].measures[0].isPickup).toBe(true);
    expect(result.score.parts[1].measures[0].isPickup).toBe(true);
  });
});

describe("InsertGraceNote", () => {
  it("inserts a grace note before cursor", () => {
    const m = factory.measure([
      factory.voice([factory.note("D", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });
    const cmd = new InsertGraceNote("C", 4, "natural");
    const result = cmd.execute(snap);

    const events = result.score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("grace");
    if (events[0].kind === "grace") {
      expect(events[0].head.pitch.pitchClass).toBe("C");
      expect(events[0].slash).toBe(true);
    }
    expect(result.inputState.cursor.eventIndex).toBe(1);
  });

  it("inserts grace note with slash=false for appoggiatura", () => {
    const snap = makeSnapshot();
    const cmd = new InsertGraceNote("E", 4, "sharp", false);
    const result = cmd.execute(snap);

    const evt = result.score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("grace");
    if (evt.kind === "grace") {
      expect(evt.slash).toBe(false);
      expect(evt.head.pitch.accidental).toBe("sharp");
    }
  });

  it("grace note has zero duration for capacity", async () => {
    const { voiceTicksUsed } = await import("../../model/duration");
    const grace = factory.graceNote("C", 4);
    expect(voiceTicksUsed([grace])).toBe(0);
  });
});

describe("SetSlur", () => {
  it("creates a slur between two events", () => {
    const n1 = factory.note("C", 4, factory.dur("quarter"));
    const n2 = factory.note("D", 4, factory.dur("quarter"));
    const m = factory.measure([factory.voice([n1, n2])]);
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });

    const cmd = new SetSlur(n1.id, n2.id);
    const result = cmd.execute(snap);

    const slurs = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "slur",
    );
    expect(slurs).toHaveLength(1);
    if (slurs[0].kind === "slur") {
      expect(slurs[0].startEventId).toBe(n1.id);
      expect(slurs[0].endEventId).toBe(n2.id);
    }
  });

  it("replaces existing slur with same start", () => {
    const n1 = factory.note("C", 4, factory.dur("quarter"));
    const n2 = factory.note("D", 4, factory.dur("quarter"));
    const n3 = factory.note("E", 4, factory.dur("quarter"));
    const m = factory.measure([factory.voice([n1, n2, n3])]);
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });

    const r1 = new SetSlur(n1.id, n2.id).execute(snap);
    const r2 = new SetSlur(n1.id, n3.id).execute(r1);

    const slurs = r2.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "slur",
    );
    expect(slurs).toHaveLength(1);
    if (slurs[0].kind === "slur") {
      expect(slurs[0].endEventId).toBe(n3.id);
    }
  });
});

describe("DeleteNote", () => {
  it("deletes the note at cursor", () => {
    const m = factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.note("D", 4, factory.dur("quarter")),
      ]),
    ]);
    // Cursor at eventIndex 0 → deletes event 0 (C), D remains
    const snap = makeSnapshot({
      measures: [m, factory.measure([factory.voice([])])],
      cursor: { eventIndex: 0 },
    });
    const cmd = new DeleteNote();
    const result = cmd.execute(snap);

    expect(result.score.parts[0].measures[0].voices[0].events).toHaveLength(1);
    const remaining = result.score.parts[0].measures[0].voices[0].events[0];
    if (remaining.kind === "note") {
      expect(remaining.head.pitch.pitchClass).toBe("D");
    }
  });

  it("deletes last event when cursor is at append position", () => {
    const m = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
    ]);
    const snap = makeSnapshot({
      measures: [m, factory.measure([factory.voice([])])],
      cursor: { eventIndex: 1 },
    });
    const cmd = new DeleteNote();
    const result = cmd.execute(snap);
    // eventIndex 1 is append position → deletes last event
    expect(result.score.parts[0].measures[0].voices[0].events).toHaveLength(0);
  });

  it("does nothing when measure is empty", () => {
    const m = factory.measure([factory.voice([])]);
    const snap = makeSnapshot({
      measures: [m, factory.measure([factory.voice([])])],
      cursor: { eventIndex: 0 },
    });
    const cmd = new DeleteNote();
    const result = cmd.execute(snap);
    expect(result.score.parts[0].measures[0].voices[0].events).toHaveLength(0);
  });
});
