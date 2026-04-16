import { describe, it, expect } from "vitest";
import { SetMeasureBreak } from "../SetMeasureBreak";
import { factory } from "../../model";
import { defaultInputState } from "../../input/InputState";
import type { EditorSnapshot } from "../Command";

function makeSnapshot(): EditorSnapshot {
  const score = factory.score("Test", "", [
    factory.part("Piano", "Pno.", [
      factory.measure([factory.voice([])]),
      factory.measure([factory.voice([])]),
    ]),
    factory.part("Guitar", "Gtr.", [
      factory.measure([factory.voice([])]),
      factory.measure([factory.voice([])]),
    ]),
  ]);
  return { score, inputState: defaultInputState() };
}

describe("SetMeasureBreak", () => {
  it("sets system break on all parts at cursor measure", () => {
    const state = makeSnapshot();
    const cmd = new SetMeasureBreak("system");
    const result = cmd.execute(state);

    expect(result.score.parts[0].measures[0].break).toBe("system");
    expect(result.score.parts[1].measures[0].break).toBe("system");
    // Measure 1 should be unaffected
    expect(result.score.parts[0].measures[1].break).toBeUndefined();
  });

  it("sets page break", () => {
    const state = makeSnapshot();
    const cmd = new SetMeasureBreak("page");
    const result = cmd.execute(state);

    expect(result.score.parts[0].measures[0].break).toBe("page");
  });

  it("sets section break", () => {
    const state = makeSnapshot();
    const cmd = new SetMeasureBreak("section");
    const result = cmd.execute(state);

    expect(result.score.parts[0].measures[0].break).toBe("section");
  });

  it("clears break when null is passed", () => {
    const state = makeSnapshot();
    // First set a break
    const setCmd = new SetMeasureBreak("system");
    const withBreak = setCmd.execute(state);
    expect(withBreak.score.parts[0].measures[0].break).toBe("system");

    // Then clear it
    const clearCmd = new SetMeasureBreak(null);
    const cleared = clearCmd.execute(withBreak);
    expect(cleared.score.parts[0].measures[0].break).toBeUndefined();
    expect(cleared.score.parts[1].measures[0].break).toBeUndefined();
  });

  it("does not mutate original state", () => {
    const state = makeSnapshot();
    const cmd = new SetMeasureBreak("system");
    cmd.execute(state);

    expect(state.score.parts[0].measures[0].break).toBeUndefined();
  });
});
