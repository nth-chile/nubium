import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { INSTRUMENTS } from "../../model/instruments";
import { AddPart } from "../AddPart";
import { RemovePart } from "../RemovePart";
import { ReorderParts } from "../ReorderParts";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(overrides?: {
  parts?: ReturnType<typeof factory.part>[];
  cursor?: Partial<ReturnType<typeof defaultInputState>["cursor"]>;
}): EditorSnapshot {
  const parts = overrides?.parts ?? [
    factory.part("Piano", "Pno.", [
      factory.measure([factory.voice([])]),
      factory.measure([factory.voice([])]),
    ], "piano"),
  ];
  const input = defaultInputState();
  if (overrides?.cursor) {
    Object.assign(input.cursor, overrides.cursor);
  }
  return {
    score: factory.score("Test", "", parts),
    inputState: input,
  };
}

describe("AddPart", () => {
  it("adds a new part with the correct instrument", () => {
    const snap = makeSnapshot();
    expect(snap.score.parts).toHaveLength(1);

    const cmd = new AddPart("violin");
    const result = cmd.execute(snap);

    expect(result.score.parts).toHaveLength(2);
    expect(result.score.parts[1].name).toBe("Violin");
    expect(result.score.parts[1].abbreviation).toBe("Vln.");
    expect(result.score.parts[1].instrumentId).toBe("violin");
    expect(result.score.parts[1].muted).toBe(false);
    expect(result.score.parts[1].solo).toBe(false);
  });

  it("fills new part with matching number of measures", () => {
    const snap = makeSnapshot();
    expect(snap.score.parts[0].measures).toHaveLength(2);

    const cmd = new AddPart("flute");
    const result = cmd.execute(snap);

    expect(result.score.parts[1].measures).toHaveLength(2);
  });

  it("copies time signature from reference part", () => {
    const parts = [
      factory.part("Piano", "Pno.", [
        factory.measure([factory.voice([])], {
          timeSignature: { numerator: 3, denominator: 4 },
        }),
      ], "piano"),
    ];
    const snap = makeSnapshot({ parts });

    const cmd = new AddPart("guitar");
    const result = cmd.execute(snap);

    expect(result.score.parts[1].measures[0].timeSignature).toEqual({
      numerator: 3,
      denominator: 4,
    });
  });

  it("sets the correct clef based on instrument", () => {
    const snap = makeSnapshot();

    const cmd = new AddPart("cello");
    const result = cmd.execute(snap);

    expect(result.score.parts[1].measures[0].clef.type).toBe("bass");
  });

  it.each(INSTRUMENTS)("opens $name with $clef clef on every measure", (inst) => {
    const snap = makeSnapshot();
    const result = new AddPart(inst.id).execute(snap);
    const added = result.score.parts[1];
    expect(added.instrumentId).toBe(inst.id);
    for (const m of added.measures) {
      expect(m.clef.type).toBe(inst.clef);
    }
  });
});

describe("RemovePart", () => {
  it("removes a part by index", () => {
    const parts = [
      factory.part("Piano", "Pno.", [factory.measure([factory.voice([])])], "piano"),
      factory.part("Violin", "Vln.", [factory.measure([factory.voice([])])], "violin"),
    ];
    const snap = makeSnapshot({ parts });

    const cmd = new RemovePart(1);
    const result = cmd.execute(snap);

    expect(result.score.parts).toHaveLength(1);
    expect(result.score.parts[0].name).toBe("Piano");
  });

  it("does not remove the last part", () => {
    const snap = makeSnapshot();
    expect(snap.score.parts).toHaveLength(1);

    const cmd = new RemovePart(0);
    const result = cmd.execute(snap);

    expect(result.score.parts).toHaveLength(1);
  });

  it("adjusts cursor when removing the part the cursor is on", () => {
    const parts = [
      factory.part("Piano", "Pno.", [factory.measure([factory.voice([])])], "piano"),
      factory.part("Violin", "Vln.", [factory.measure([factory.voice([])])], "violin"),
    ];
    const snap = makeSnapshot({ parts, cursor: { partIndex: 1 } });

    const cmd = new RemovePart(1);
    const result = cmd.execute(snap);

    expect(result.inputState.cursor.partIndex).toBe(0);
  });

  it("does not remove with invalid index", () => {
    const parts = [
      factory.part("Piano", "Pno.", [factory.measure([factory.voice([])])], "piano"),
      factory.part("Violin", "Vln.", [factory.measure([factory.voice([])])], "violin"),
    ];
    const snap = makeSnapshot({ parts });

    const cmd = new RemovePart(5);
    const result = cmd.execute(snap);

    expect(result.score.parts).toHaveLength(2);
  });
});

describe("ReorderParts", () => {
  it("moves a part up", () => {
    const parts = [
      factory.part("Piano", "Pno.", [factory.measure([factory.voice([])])], "piano"),
      factory.part("Violin", "Vln.", [factory.measure([factory.voice([])])], "violin"),
    ];
    const snap = makeSnapshot({ parts });

    const cmd = new ReorderParts(1, "up");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].name).toBe("Violin");
    expect(result.score.parts[1].name).toBe("Piano");
  });

  it("moves a part down", () => {
    const parts = [
      factory.part("Piano", "Pno.", [factory.measure([factory.voice([])])], "piano"),
      factory.part("Violin", "Vln.", [factory.measure([factory.voice([])])], "violin"),
    ];
    const snap = makeSnapshot({ parts });

    const cmd = new ReorderParts(0, "down");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].name).toBe("Violin");
    expect(result.score.parts[1].name).toBe("Piano");
  });

  it("does nothing when moving first part up", () => {
    const parts = [
      factory.part("Piano", "Pno.", [factory.measure([factory.voice([])])], "piano"),
      factory.part("Violin", "Vln.", [factory.measure([factory.voice([])])], "violin"),
    ];
    const snap = makeSnapshot({ parts });

    const cmd = new ReorderParts(0, "up");
    const result = cmd.execute(snap);

    expect(result.score.parts[0].name).toBe("Piano");
    expect(result.score.parts[1].name).toBe("Violin");
  });

  it("updates cursor when reordering the active part", () => {
    const parts = [
      factory.part("Piano", "Pno.", [factory.measure([factory.voice([])])], "piano"),
      factory.part("Violin", "Vln.", [factory.measure([factory.voice([])])], "violin"),
    ];
    const snap = makeSnapshot({ parts, cursor: { partIndex: 0 } });

    const cmd = new ReorderParts(0, "down");
    const result = cmd.execute(snap);

    expect(result.inputState.cursor.partIndex).toBe(1);
  });
});
