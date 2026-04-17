import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { ClearSelectedMeasures } from "../ClearSelectedMeasures";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";
import type { Selection } from "../../plugins/PluginAPI";

function makeSnapshot(overrides?: {
  measures?: ReturnType<typeof factory.measure>[];
  cursor?: Partial<ReturnType<typeof defaultInputState>["cursor"]>;
}): EditorSnapshot {
  const measures = overrides?.measures ?? [
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

describe("ClearSelectedMeasures", () => {
  it("replaces voice events with a whole rest, preserving measure structure", () => {
    const m1 = factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.note("D", 4, factory.dur("quarter")),
        factory.note("E", 4, factory.dur("quarter")),
        factory.note("F", 4, factory.dur("quarter")),
      ]),
    ]);
    const m2 = factory.measure([
      factory.voice([
        factory.note("G", 4, factory.dur("half")),
        factory.note("A", 4, factory.dur("half")),
      ]),
    ]);
    const m3 = factory.measure([
      factory.voice([factory.note("B", 4, factory.dur("whole"))]),
    ]);

    const snap = makeSnapshot({ measures: [m1, m2, m3] });
    const sel: Selection = { partIndex: 0, measureStart: 0, measureEnd: 1, measureAnchor: 0 };
    const cmd = new ClearSelectedMeasures(sel);
    const result = cmd.execute(snap);

    // Measures still exist — count unchanged
    expect(result.score.parts[0].measures).toHaveLength(3);

    // Selected measures (0 and 1) cleared to whole rest
    for (const idx of [0, 1]) {
      const voice = result.score.parts[0].measures[idx].voices[0];
      expect(voice.events).toHaveLength(1);
      expect(voice.events[0].kind).toBe("rest");
      expect(voice.events[0].duration.type).toBe("whole");
    }

    // Unselected measure (2) untouched
    const m3Events = result.score.parts[0].measures[2].voices[0].events;
    expect(m3Events).toHaveLength(1);
    expect(m3Events[0].kind).toBe("note");
  });

  it("clears all voices in each selected measure", () => {
    const v1 = factory.voice([
      factory.note("C", 4, factory.dur("quarter")),
      factory.note("D", 4, factory.dur("quarter")),
    ]);
    const v2 = factory.voice([
      factory.note("E", 5, factory.dur("half")),
    ]);
    const snap = makeSnapshot({ measures: [factory.measure([v1, v2])] });

    const sel: Selection = { partIndex: 0, measureStart: 0, measureEnd: 0, measureAnchor: 0 };
    const cmd = new ClearSelectedMeasures(sel);
    const result = cmd.execute(snap);

    // Both voices cleared
    for (const voice of result.score.parts[0].measures[0].voices) {
      expect(voice.events).toHaveLength(1);
      expect(voice.events[0].kind).toBe("rest");
      expect(voice.events[0].duration.type).toBe("whole");
    }
  });

  it("moves cursor to the start of the selection", () => {
    const m1 = factory.measure([factory.voice([factory.note("C", 4, factory.dur("whole"))])]);
    const m2 = factory.measure([factory.voice([factory.note("D", 4, factory.dur("whole"))])]);
    const snap = makeSnapshot({
      measures: [m1, m2],
      cursor: { measureIndex: 1, eventIndex: 0 },
    });

    const sel: Selection = { partIndex: 0, measureStart: 0, measureEnd: 1, measureAnchor: 0 };
    const cmd = new ClearSelectedMeasures(sel);
    const result = cmd.execute(snap);

    expect(result.inputState.cursor.measureIndex).toBe(0);
    expect(result.inputState.cursor.eventIndex).toBe(0);
  });

  it("does not affect other parts", () => {
    const partA = factory.part("A", "A", [
      factory.measure([factory.voice([factory.note("C", 4, factory.dur("whole"))])]),
    ]);
    const partB = factory.part("B", "B", [
      factory.measure([factory.voice([factory.note("G", 5, factory.dur("whole"))])]),
    ]);
    const input = defaultInputState();
    const snap: EditorSnapshot = {
      score: factory.score("Test", "", [partA, partB]),
      inputState: input,
    };

    const sel: Selection = { partIndex: 0, measureStart: 0, measureEnd: 0, measureAnchor: 0 };
    const cmd = new ClearSelectedMeasures(sel);
    const result = cmd.execute(snap);

    // Part A cleared
    expect(result.score.parts[0].measures[0].voices[0].events[0].kind).toBe("rest");
    // Part B untouched
    expect(result.score.parts[1].measures[0].voices[0].events[0].kind).toBe("note");
  });

  it("returns state unchanged for invalid partIndex", () => {
    const snap = makeSnapshot({
      measures: [factory.measure([factory.voice([factory.note("C", 4, factory.dur("whole"))])])],
    });
    const sel: Selection = { partIndex: 99, measureStart: 0, measureEnd: 0, measureAnchor: 0 };
    const cmd = new ClearSelectedMeasures(sel);
    const result = cmd.execute(snap);
    expect(result).toBe(snap);
  });

  it("preserves measure annotations after clearing", () => {
    const m = factory.measure(
      [factory.voice([factory.note("C", 4, factory.dur("whole"))])],
      { annotations: [{ kind: "rehearsal-mark", text: "A" }] },
    );
    const snap = makeSnapshot({ measures: [m] });

    const sel: Selection = { partIndex: 0, measureStart: 0, measureEnd: 0, measureAnchor: 0 };
    const cmd = new ClearSelectedMeasures(sel);
    const result = cmd.execute(snap);

    // Events cleared but annotation preserved
    expect(result.score.parts[0].measures[0].voices[0].events[0].kind).toBe("rest");
    expect(result.score.parts[0].measures[0].annotations).toHaveLength(1);
    expect(result.score.parts[0].measures[0].annotations[0].kind).toBe("rehearsal-mark");
  });
});
