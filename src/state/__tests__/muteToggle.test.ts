import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";

function setupTwoParts() {
  const score = factory.score("Test", "", [
    factory.part("Piano", "Pno.", [
      factory.measure([
        factory.voice([factory.note("C", 4, factory.dur("quarter"))]),
      ]),
    ]),
    factory.part("Bass", "Bs.", [
      factory.measure([
        factory.voice([factory.note("E", 3, factory.dur("quarter"))]),
      ]),
    ]),
  ]);
  useEditorStore.setState({ score });
}

describe("toggleMute", () => {
  beforeEach(setupTwoParts);

  it("mutes an unmuted part", () => {
    useEditorStore.getState().toggleMute(0);
    expect(useEditorStore.getState().score.parts[0].muted).toBe(true);
  });

  it("unmutes a muted part", () => {
    useEditorStore.getState().toggleMute(0);
    useEditorStore.getState().toggleMute(0);
    expect(useEditorStore.getState().score.parts[0].muted).toBe(false);
  });

  it("mutes only the targeted part", () => {
    useEditorStore.getState().toggleMute(1);
    expect(useEditorStore.getState().score.parts[0].muted).toBeFalsy();
    expect(useEditorStore.getState().score.parts[1].muted).toBe(true);
  });

  it("ignores invalid part index", () => {
    const before = useEditorStore.getState().score;
    useEditorStore.getState().toggleMute(99);
    expect(useEditorStore.getState().score).toBe(before);
  });
});

describe("moveCursorToPart resets voice", () => {
  beforeEach(setupTwoParts);

  it("resets voiceIndex to 0 when switching parts", () => {
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 2, eventIndex: 0, staveIndex: 0 },
      },
    }));

    useEditorStore.getState().moveCursorToPart(1);
    const cursor = useEditorStore.getState().inputState.cursor;
    expect(cursor.partIndex).toBe(1);
    expect(cursor.voiceIndex).toBe(0);
  });
});
