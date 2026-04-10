import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "../index";
import { factory } from "../../model";

describe("Navigation mark serialization", () => {
  it("round-trips navigation marks", () => {
    const m1 = factory.measure([factory.voice([])]);
    m1.navigation = {
      segno: true,
      volta: { endings: [1] },
    };
    m1.barlineEnd = "repeat-end";

    const m2 = factory.measure([factory.voice([])]);
    m2.navigation = {
      volta: { endings: [2] },
      dsText: "D.S. al Coda",
    };

    const m3 = factory.measure([factory.voice([])]);
    m3.navigation = {
      coda: true,
      fine: true,
    };

    const m4 = factory.measure([factory.voice([])]);
    m4.navigation = {
      toCoda: true,
      dcText: "D.C. al Fine",
    };

    const score = factory.score("Nav Test", "Test", [
      factory.part("P1", "P1", [m1, m2, m3, m4]),
    ]);

    const text = serialize(score);
    const restored = deserialize(text);

    expect(restored.parts[0].measures[0].navigation?.segno).toBe(true);
    expect(restored.parts[0].measures[0].navigation?.volta?.endings).toEqual([1]);
    expect(restored.parts[0].measures[0].barlineEnd).toBe("repeat-end");

    expect(restored.parts[0].measures[1].navigation?.volta?.endings).toEqual([2]);
    expect(restored.parts[0].measures[1].navigation?.dsText).toBe("D.S. al Coda");

    expect(restored.parts[0].measures[2].navigation?.coda).toBe(true);
    expect(restored.parts[0].measures[2].navigation?.fine).toBe(true);

    expect(restored.parts[0].measures[3].navigation?.toCoda).toBe(true);
    expect(restored.parts[0].measures[3].navigation?.dcText).toBe("D.C. al Fine");
  });

  it("round-trips slash notes", () => {
    const m = factory.measure([
      factory.voice([
        factory.slash(factory.dur("quarter")),
        factory.slash(factory.dur("quarter")),
        factory.slash(factory.dur("half")),
      ]),
    ]);

    const score = factory.score("Slash Test", "Test", [
      factory.part("P1", "P1", [m]),
    ]);

    const text = serialize(score);
    const json = JSON.parse(text);
    const events = json.parts[0].measures[0].voices[0].events;
    expect(events[0].type).toBe("slash");
    expect(events[0].duration).toBe("quarter");
    expect(events[2].type).toBe("slash");
    expect(events[2].duration).toBe("half");

    const restored = deserialize(text);
    const revents = restored.parts[0].measures[0].voices[0].events;
    expect(revents).toHaveLength(3);
    expect(revents[0].kind).toBe("slash");
    expect(revents[0].duration.type).toBe("quarter");
    expect(revents[1].kind).toBe("slash");
    expect(revents[2].kind).toBe("slash");
    expect(revents[2].duration.type).toBe("half");
  });

  it("round-trips dotted slash notes", () => {
    const m = factory.measure([
      factory.voice([
        factory.slash(factory.dur("quarter", 1)),
      ]),
    ]);

    const score = factory.score("Dotted Slash", "Test", [
      factory.part("P1", "P1", [m]),
    ]);

    const text = serialize(score);
    const json = JSON.parse(text);
    expect(json.parts[0].measures[0].voices[0].events[0].duration).toBe("quarter.");

    const restored = deserialize(text);
    const event = restored.parts[0].measures[0].voices[0].events[0];
    expect(event.kind).toBe("slash");
    expect(event.duration.dots).toBe(1);
  });

  it("round-trips all slash durations", () => {
    const durations: Array<"whole" | "half" | "quarter" | "eighth" | "16th" | "32nd"> =
      ["whole", "half", "quarter", "eighth", "16th", "32nd"];
    for (const dur of durations) {
      const m = factory.measure([
        factory.voice([factory.slash(factory.dur(dur))]),
      ]);
      const score = factory.score(`Slash ${dur}`, "Test", [
        factory.part("P1", "P1", [m]),
      ]);
      const text = serialize(score);
      const json = JSON.parse(text);
      expect(json.parts[0].measures[0].voices[0].events[0].type).toBe("slash");
      expect(json.parts[0].measures[0].voices[0].events[0].duration).toBe(dur);

      const restored = deserialize(text);
      const event = restored.parts[0].measures[0].voices[0].events[0];
      expect(event.kind).toBe("slash");
      expect(event.duration.type).toBe(dur);
    }
  });

  it("round-trips slash with rests in same voice", () => {
    const m = factory.measure([
      factory.voice([
        factory.slash(factory.dur("quarter")),
        factory.rest(factory.dur("quarter")),
        factory.slash(factory.dur("half")),
      ]),
    ]);
    const score = factory.score("Mixed", "Test", [
      factory.part("P1", "P1", [m]),
    ]);
    const text = serialize(score);
    const restored = deserialize(text);
    const events = restored.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("slash");
    expect(events[1].kind).toBe("rest");
    expect(events[2].kind).toBe("slash");
  });

  it("round-trips repeat-both barline", () => {
    const m = factory.measure([factory.voice([])]);
    m.barlineEnd = "repeat-both";

    const score = factory.score("Repeat Both", "Test", [
      factory.part("P1", "P1", [m]),
    ]);

    const text = serialize(score);
    const json = JSON.parse(text);
    expect(json.parts[0].measures[0].barline).toBe("repeat-both");

    const restored = deserialize(text);
    expect(restored.parts[0].measures[0].barlineEnd).toBe("repeat-both");
  });
});
