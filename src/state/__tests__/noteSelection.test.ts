import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";

function resetStore() {
  const score = factory.score("Test", "", [
    factory.part("P", "P", [
      factory.measure([
        factory.voice([
          factory.note("C", 4, factory.dur("quarter")),
          factory.note("D", 4, factory.dur("quarter")),
          factory.note("E", 4, factory.dur("quarter")),
          factory.note("F", 4, factory.dur("quarter")),
        ]),
      ]),
      factory.measure([factory.voice([])]),
    ]),
  ]);
  useEditorStore.setState({
    score,
    selection: null,
    noteSelection: null,
    inputState: {
      ...useEditorStore.getState().inputState,
      cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
    },
  });
}

describe("Note-level selection", () => {
  beforeEach(resetStore);

  it("selectNoteAtCursor creates a single-note selection", () => {
    useEditorStore.getState().selectNoteAtCursor();
    const ns = useEditorStore.getState().noteSelection;
    expect(ns).not.toBeNull();
    expect(ns!.startEvent).toBe(0);
    expect(ns!.endEvent).toBe(0);
    expect(ns!.startMeasure).toBe(0);
  });

  it("selectNoteAtCursor clears measure selection", () => {
    useEditorStore.setState({ selection: { partIndex: 0, measureStart: 0, measureEnd: 1 } });
    useEditorStore.getState().selectNoteAtCursor();
    expect(useEditorStore.getState().selection).toBeNull();
    expect(useEditorStore.getState().noteSelection).not.toBeNull();
  });

  it("setNoteSelection clears measure selection", () => {
    useEditorStore.setState({ selection: { partIndex: 0, measureStart: 0, measureEnd: 1 } });
    useEditorStore.getState().setNoteSelection({
      partIndex: 0, voiceIndex: 0, startMeasure: 0, startEvent: 0, endMeasure: 0, endEvent: 2, anchorMeasure: 0, anchorEvent: 0,
    });
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("setSelection clears note selection", () => {
    useEditorStore.getState().setNoteSelection({
      partIndex: 0, voiceIndex: 0, startMeasure: 0, startEvent: 0, endMeasure: 0, endEvent: 2, anchorMeasure: 0, anchorEvent: 0,
    });
    useEditorStore.getState().setSelection({ partIndex: 0, measureStart: 0, measureEnd: 1 });
    expect(useEditorStore.getState().noteSelection).toBeNull();
  });

  it("extendNoteSelection extends right", () => {
    useEditorStore.getState().selectNoteAtCursor();
    useEditorStore.getState().extendNoteSelection("right");
    const ns = useEditorStore.getState().noteSelection!;
    expect(ns.startEvent).toBe(0);
    expect(ns.endEvent).toBe(1);
  });

  it("extendNoteSelection left reverses direction from single-note selection", () => {
    useEditorStore.setState((s) => ({
      inputState: { ...s.inputState, cursor: { ...s.inputState.cursor, eventIndex: 2 } },
    }));
    useEditorStore.getState().selectNoteAtCursor();
    useEditorStore.getState().extendNoteSelection("left");
    const ns = useEditorStore.getState().noteSelection!;
    expect(ns.startEvent).toBe(1);
    expect(ns.endEvent).toBe(2);
  });

  it("extendNoteSelection left does not go below 0", () => {
    useEditorStore.getState().selectNoteAtCursor();
    useEditorStore.getState().extendNoteSelection("left");
    const ns = useEditorStore.getState().noteSelection!;
    expect(ns.startEvent).toBe(0);
    expect(ns.endEvent).toBe(0);
  });

  it("extendNoteSelection crosses to next measure", () => {
    useEditorStore.setState((s) => ({
      inputState: { ...s.inputState, cursor: { ...s.inputState.cursor, eventIndex: 3 } },
    }));
    useEditorStore.getState().selectNoteAtCursor();
    useEditorStore.getState().extendNoteSelection("right");
    const ns = useEditorStore.getState().noteSelection!;
    // Should cross into measure 1
    expect(ns.endMeasure).toBe(1);
    expect(ns.endEvent).toBe(0);
  });

  it("deleteNoteSelection removes selected events", () => {
    useEditorStore.getState().setNoteSelection({
      partIndex: 0, voiceIndex: 0, startMeasure: 0, startEvent: 1, endMeasure: 0, endEvent: 2, anchorMeasure: 0, anchorEvent: 1,
    });
    useEditorStore.getState().deleteNoteSelection();

    const events = useEditorStore.getState().score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    // C and F remain (D and E deleted)
    if (events[0].kind === "note") expect(events[0].head.pitch.pitchClass).toBe("C");
    if (events[1].kind === "note") expect(events[1].head.pitch.pitchClass).toBe("F");
    expect(useEditorStore.getState().noteSelection).toBeNull();
  });

  it("deleteNoteSelection adjusts cursor", () => {
    useEditorStore.getState().setNoteSelection({
      partIndex: 0, voiceIndex: 0, startMeasure: 0, startEvent: 2, endMeasure: 0, endEvent: 3, anchorMeasure: 0, anchorEvent: 2,
    });
    useEditorStore.getState().deleteNoteSelection();
    expect(useEditorStore.getState().inputState.cursor.eventIndex).toBe(2);
  });

  it("setDuration with noteSelection changes selected event durations", () => {
    useEditorStore.getState().setNoteSelection({
      partIndex: 0, voiceIndex: 0, startMeasure: 0, startEvent: 0, endMeasure: 0, endEvent: 1, anchorMeasure: 0, anchorEvent: 0,
    });
    useEditorStore.getState().setDuration("half");

    const events = useEditorStore.getState().score.parts[0].measures[0].voices[0].events;
    expect(events[0].duration.type).toBe("half");
    expect(events[1].duration.type).toBe("half");
    expect(events[2].duration.type).toBe("quarter"); // unchanged
  });

  it("extendNoteSelection left retracts moving end after extending right", () => {
    // Start at event 1, extend right twice: anchor=1, movingEnd=3, selection = 1-3
    useEditorStore.setState((s) => ({
      inputState: { ...s.inputState, cursor: { ...s.inputState.cursor, eventIndex: 1 } },
    }));
    useEditorStore.getState().selectNoteAtCursor();
    useEditorStore.getState().extendNoteSelection("right");
    useEditorStore.getState().extendNoteSelection("right");
    expect(useEditorStore.getState().noteSelection!.endEvent).toBe(3);

    // Left should retract movingEnd to 2
    useEditorStore.getState().extendNoteSelection("left");
    const ns = useEditorStore.getState().noteSelection!;
    expect(ns.startEvent).toBe(1);
    expect(ns.endEvent).toBe(2);

    // Keep going left past anchor — selection reverses
    useEditorStore.getState().extendNoteSelection("left");
    useEditorStore.getState().extendNoteSelection("left");
    const ns2 = useEditorStore.getState().noteSelection!;
    expect(ns2.startEvent).toBe(0);
    expect(ns2.endEvent).toBe(1); // anchor stays at 1
  });

  it("setDuration changes note at cursor without selection", () => {
    // Cursor at event 1, no selection
    useEditorStore.setState((s) => ({
      inputState: { ...s.inputState, cursor: { ...s.inputState.cursor, eventIndex: 1 } },
    }));
    useEditorStore.getState().setDuration("half");

    const events = useEditorStore.getState().score.parts[0].measures[0].voices[0].events;
    expect(events[1].duration.type).toBe("half");
    expect(events[0].duration.type).toBe("quarter"); // unchanged
    expect(events[2].duration.type).toBe("quarter"); // unchanged
  });

  it("does nothing when selecting past end of voice", () => {
    useEditorStore.setState((s) => ({
      inputState: { ...s.inputState, cursor: { ...s.inputState.cursor, eventIndex: 10 } },
    }));
    useEditorStore.getState().selectNoteAtCursor();
    expect(useEditorStore.getState().noteSelection).toBeNull();
  });
});
