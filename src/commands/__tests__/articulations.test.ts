import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { ToggleArticulation } from "../ToggleArticulation";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(overrides?: {
  measures?: ReturnType<typeof factory.measure>[];
  cursor?: Partial<ReturnType<typeof defaultInputState>["cursor"]>;
}): EditorSnapshot {
  const measures = overrides?.measures ?? [
    factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.rest(factory.dur("quarter")),
      ]),
    ]),
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

describe("ToggleArticulation", () => {
  it("adds staccato to a note", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const cmd = new ToggleArticulation("staccato");
    const result = cmd.execute(snap);

    const event = result.score.parts[0].measures[0].voices[0].events[0];
    expect(event.kind).toBe("note");
    if (event.kind === "note") {
      expect(event.articulations).toHaveLength(1);
      expect(event.articulations![0].kind).toBe("staccato");
    }
  });

  it("removes staccato when toggled again", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const r1 = new ToggleArticulation("staccato").execute(snap);
    const r2 = new ToggleArticulation("staccato").execute(r1);

    const event = r2.score.parts[0].measures[0].voices[0].events[0];
    if (event.kind === "note") {
      expect(event.articulations).toBeUndefined();
    }
  });

  it("adds multiple different articulations", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const r1 = new ToggleArticulation("staccato").execute(snap);
    const r2 = new ToggleArticulation("accent").execute(r1);

    const event = r2.score.parts[0].measures[0].voices[0].events[0];
    if (event.kind === "note") {
      expect(event.articulations).toHaveLength(2);
      expect(event.articulations!.map((a) => a.kind)).toContain("staccato");
      expect(event.articulations!.map((a) => a.kind)).toContain("accent");
    }
  });

  it("removes only the toggled articulation, keeps others", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const r1 = new ToggleArticulation("staccato").execute(snap);
    const r2 = new ToggleArticulation("accent").execute(r1);
    const r3 = new ToggleArticulation("staccato").execute(r2);

    const event = r3.score.parts[0].measures[0].voices[0].events[0];
    if (event.kind === "note") {
      expect(event.articulations).toHaveLength(1);
      expect(event.articulations![0].kind).toBe("accent");
    }
  });

  it("does nothing on rests", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 1 } });
    const cmd = new ToggleArticulation("staccato");
    const result = cmd.execute(snap);

    const event = result.score.parts[0].measures[0].voices[0].events[1];
    expect(event.kind).toBe("rest");
  });

  it("does nothing when cursor is out of bounds", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 5 } });
    const cmd = new ToggleArticulation("staccato");
    const result = cmd.execute(snap);

    // Should return original state unchanged
    expect(result.score.parts[0].measures[0].voices[0].events[0]).toEqual(
      snap.score.parts[0].measures[0].voices[0].events[0]
    );
  });

  it("works with tenuto", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const result = new ToggleArticulation("tenuto").execute(snap);

    const event = result.score.parts[0].measures[0].voices[0].events[0];
    if (event.kind === "note") {
      expect(event.articulations).toHaveLength(1);
      expect(event.articulations![0].kind).toBe("tenuto");
    }
  });

  it("works with fermata", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const result = new ToggleArticulation("fermata").execute(snap);

    const event = result.score.parts[0].measures[0].voices[0].events[0];
    if (event.kind === "note") {
      expect(event.articulations![0].kind).toBe("fermata");
    }
  });

  it("works with marcato", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const result = new ToggleArticulation("marcato").execute(snap);

    const event = result.score.parts[0].measures[0].voices[0].events[0];
    if (event.kind === "note") {
      expect(event.articulations![0].kind).toBe("marcato");
    }
  });
});
