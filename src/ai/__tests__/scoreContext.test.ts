import { describe, it, expect } from "vitest";
import { buildScoreContext, buildSystemPrompt } from "../ScoreContext";
import { factory } from "../../model";
import type { CursorPosition } from "../../input/InputState";

function makeTestScore() {
  return factory.score("Test Song", "Composer", [
    factory.part("Piano", "Pno.", [
      factory.measure([factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.note("D", 4, factory.dur("quarter")),
        factory.note("E", 4, factory.dur("quarter")),
        factory.note("F", 4, factory.dur("quarter")),
      ])]),
      factory.measure([factory.voice([
        factory.note("G", 4, factory.dur("half")),
        factory.note("A", 4, factory.dur("half")),
      ])]),
    ], "piano"),
    factory.part("Guitar", "Gtr.", [
      factory.measure([factory.voice([
        factory.rest(factory.dur("whole")),
      ])]),
      factory.measure([factory.voice([
        factory.rest(factory.dur("whole")),
      ])]),
    ], "guitar"),
  ]);
}

describe("buildScoreContext", () => {
  it("includes score JSON without cursor or selection", () => {
    const score = makeTestScore();
    const ctx = buildScoreContext(score);
    expect(ctx).toContain("```json");
    expect(ctx).toContain('"title": "Test Song"');
    expect(ctx).toContain("Selection: none.");
  });

  it("includes cursor position when provided", () => {
    const score = makeTestScore();
    const cursor: CursorPosition = {
      partIndex: 0,
      measureIndex: 1,
      voiceIndex: 0,
      eventIndex: 0,
      staveIndex: 0,
    };
    const ctx = buildScoreContext(score, { cursor });
    expect(ctx).toContain('Cursor: part "Piano" (index 0), measure 2, voice 1, event index 0, staff 1.');
  });

  it("includes cursor for second part", () => {
    const score = makeTestScore();
    const cursor: CursorPosition = {
      partIndex: 1,
      measureIndex: 0,
      voiceIndex: 0,
      eventIndex: 0,
      staveIndex: 0,
    };
    const ctx = buildScoreContext(score, { cursor });
    expect(ctx).toContain('Cursor: part "Guitar" (index 1), measure 1');
  });

  it("includes cursor with non-zero voice and stave", () => {
    const score = makeTestScore();
    const cursor: CursorPosition = {
      partIndex: 0,
      measureIndex: 0,
      voiceIndex: 1,
      eventIndex: 2,
      staveIndex: 1,
    };
    const ctx = buildScoreContext(score, { cursor });
    expect(ctx).toContain("voice 2");
    expect(ctx).toContain("event index 2");
    expect(ctx).toContain("staff 2");
  });

  it("includes measure selection when provided", () => {
    const score = makeTestScore();
    const ctx = buildScoreContext(score, {
      selection: { partIndex: 0, measureStart: 0, measureEnd: 1 },
    });
    expect(ctx).toContain('Selection: part "Piano" (index 0), measures 1-2.');
    expect(ctx).not.toContain("Selection: none.");
  });

  it("reports no selection when selection is absent", () => {
    const score = makeTestScore();
    const ctx = buildScoreContext(score);
    expect(ctx).toContain("Selection: none.");
  });

  it("includes both cursor and selection together", () => {
    const score = makeTestScore();
    const cursor: CursorPosition = {
      partIndex: 0,
      measureIndex: 0,
      voiceIndex: 0,
      eventIndex: 1,
      staveIndex: 0,
    };
    const ctx = buildScoreContext(score, {
      cursor,
      selection: { partIndex: 1, measureStart: 0, measureEnd: 0 },
    });
    expect(ctx).toContain('Cursor: part "Piano"');
    expect(ctx).toContain('Selection: part "Guitar"');
    expect(ctx).not.toContain("Selection: none.");
  });

  it("handles cursor with out-of-range part index gracefully", () => {
    const score = makeTestScore();
    const cursor: CursorPosition = {
      partIndex: 99,
      measureIndex: 0,
      voiceIndex: 0,
      eventIndex: 0,
      staveIndex: 0,
    };
    // Should not throw; falls back to "part 100"
    const ctx = buildScoreContext(score, { cursor });
    expect(ctx).toContain("part 100");
  });
});

describe("buildSystemPrompt", () => {
  it("returns a non-empty system prompt", () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("tool");
  });
});
