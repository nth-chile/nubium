import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";

/**
 * Tests for voice navigation — cursor movement across measures
 * when the selected voice doesn't exist in every measure.
 */

function setupTwoMeasures() {
  // Measure 0 has two voices, measure 1 has only one
  const score = factory.score("Test", "", [
    factory.part("Piano", "Pno.", [
      factory.measure([
        factory.voice([
          factory.note("C", 4, factory.dur("quarter")),
        ]),
        factory.voice([
          factory.note("D", 4, factory.dur("quarter")),
        ]),
      ]),
      factory.measure([
        factory.voice([
          factory.note("E", 4, factory.dur("quarter")),
        ]),
      ]),
    ]),
  ]);
  useEditorStore.setState({
    score,
    inputState: {
      ...useEditorStore.getState().inputState,
      cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 1, eventIndex: 0, staveIndex: 0 },
    },
  });
}

describe("Voice navigation across measures", () => {
  beforeEach(setupTwoMeasures);

  it("moves right into a measure that lacks the current voice", () => {
    // Cursor at measure 0, voice 1, past the last event
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 1, eventIndex: 1, staveIndex: 0 },
      },
    }));

    useEditorStore.getState().moveCursor("right");
    const cursor = useEditorStore.getState().inputState.cursor;

    expect(cursor.measureIndex).toBe(1);
    expect(cursor.voiceIndex).toBe(1); // voice preserved
    expect(cursor.eventIndex).toBe(0);
  });

  it("moves right from a measure where voice doesn't exist", () => {
    // Cursor at measure 1, voice 1 (doesn't exist in measure 1)
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { partIndex: 0, measureIndex: 1, voiceIndex: 1, eventIndex: 0, staveIndex: 0 },
      },
    }));

    // Should not get stuck — treats missing voice as empty, stays at last measure
    useEditorStore.getState().moveCursor("right");
    const cursor = useEditorStore.getState().inputState.cursor;

    // Already at last measure with 0 events, nowhere to go
    expect(cursor.measureIndex).toBe(1);
    expect(cursor.voiceIndex).toBe(1);
  });

  it("moves left from a measure where voice doesn't exist", () => {
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { partIndex: 0, measureIndex: 1, voiceIndex: 1, eventIndex: 0, staveIndex: 0 },
      },
    }));

    useEditorStore.getState().moveCursor("left");
    const cursor = useEditorStore.getState().inputState.cursor;

    expect(cursor.measureIndex).toBe(0);
    expect(cursor.voiceIndex).toBe(1); // voice preserved
    expect(cursor.eventIndex).toBe(0); // last note of voice 1 in measure 0 (no append position in nav mode)
  });
});
