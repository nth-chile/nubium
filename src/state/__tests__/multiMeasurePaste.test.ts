import { describe, it, expect, beforeEach, vi } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";

// Mock navigator.clipboard for tests
const mockClipboard = {
  readText: vi.fn().mockRejectedValue(new Error("not available")),
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: mockClipboard },
  writable: true,
});

function resetStore() {
  const score = factory.score("Multi-Measure Test", "", [
    factory.part("Piano", "Pno.", [
      // Measure 0: C4 D4 E4 F4
      factory.measure([
        factory.voice([
          factory.note("C", 4, factory.dur("quarter")),
          factory.note("D", 4, factory.dur("quarter")),
          factory.note("E", 4, factory.dur("quarter")),
          factory.note("F", 4, factory.dur("quarter")),
        ]),
      ]),
      // Measure 1: G4 A4 B4 C5
      factory.measure([
        factory.voice([
          factory.note("G", 4, factory.dur("quarter")),
          factory.note("A", 4, factory.dur("quarter")),
          factory.note("B", 4, factory.dur("quarter")),
          factory.note("C", 5, factory.dur("quarter")),
        ]),
      ]),
      // Measure 2: D5 E5 F5 G5
      factory.measure([
        factory.voice([
          factory.note("D", 5, factory.dur("quarter")),
          factory.note("E", 5, factory.dur("quarter")),
          factory.note("F", 5, factory.dur("quarter")),
          factory.note("G", 5, factory.dur("quarter")),
        ]),
      ]),
      // Measure 3: empty target
      factory.measure([factory.voice([])]),
      // Measure 4: empty target
      factory.measure([factory.voice([])]),
      // Measure 5: empty target
      factory.measure([factory.voice([])]),
    ]),
  ]);
  useEditorStore.setState({
    score,
    selection: null,
    noteSelection: null,
    clipboardMeasures: null,
    clipboardEvents: null,
    inputState: {
      ...useEditorStore.getState().inputState,
      cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
    },
  });
}

describe("Multi-measure note copy/paste preserves measure boundaries (#231)", () => {
  beforeEach(() => {
    resetStore();
    mockClipboard.readText.mockRejectedValue(new Error("not available"));
  });

  it("copy spanning 2 measures preserves grouping per measure on paste", async () => {
    // Select notes across measures 0-1 (all events in both)
    useEditorStore.setState({
      noteSelection: {
        partIndex: 0,
        voiceIndex: 0,
        startMeasure: 0,
        startEvent: 0,
        endMeasure: 1,
        endEvent: 3,
        anchorMeasure: 0,
        anchorEvent: 0,
        rangeMode: true,
      },
    });

    // Copy
    useEditorStore.getState().copySelection();

    const clipboard = useEditorStore.getState().clipboardEvents;
    expect(clipboard).not.toBeNull();
    // Should have 2 groups (one per source measure)
    expect(clipboard!.measures.length).toBe(2);
    expect(clipboard!.measures[0].length).toBe(4); // C D E F
    expect(clipboard!.measures[1].length).toBe(4); // G A B C5

    // Now paste at measure 3
    useEditorStore.setState({
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 3, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      },
      noteSelection: null,
    });

    await useEditorStore.getState().pasteAtCursor();

    const result = useEditorStore.getState();
    const m3 = result.score.parts[0].measures[3].voices[0].events;
    const m4 = result.score.parts[0].measures[4].voices[0].events;

    // Measure 3 should get the first measure's events (4 notes)
    expect(m3.length).toBe(4);
    // Measure 4 should get the second measure's events (4 notes)
    expect(m4.length).toBe(4);
    // Measure 5 should remain empty (not spilled into)
    const m5 = result.score.parts[0].measures[5].voices[0].events;
    expect(m5.length).toBe(0);
  });

  it("copy spanning 3 measures distributes to 3 destination measures", async () => {
    // Select across measures 0-2
    useEditorStore.setState({
      noteSelection: {
        partIndex: 0,
        voiceIndex: 0,
        startMeasure: 0,
        startEvent: 0,
        endMeasure: 2,
        endEvent: 3,
        anchorMeasure: 0,
        anchorEvent: 0,
        rangeMode: true,
      },
    });

    useEditorStore.getState().copySelection();

    const clipboard = useEditorStore.getState().clipboardEvents;
    expect(clipboard!.measures.length).toBe(3);

    // Paste at measure 3
    useEditorStore.setState({
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 3, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      },
      noteSelection: null,
    });

    await useEditorStore.getState().pasteAtCursor();

    const result = useEditorStore.getState();
    expect(result.score.parts[0].measures[3].voices[0].events.length).toBe(4);
    expect(result.score.parts[0].measures[4].voices[0].events.length).toBe(4);
    expect(result.score.parts[0].measures[5].voices[0].events.length).toBe(4);
  });

  it("partial-measure copy at boundaries preserves correct events per measure", async () => {
    // Select last 2 events of measure 0 through first 2 events of measure 1
    useEditorStore.setState({
      noteSelection: {
        partIndex: 0,
        voiceIndex: 0,
        startMeasure: 0,
        startEvent: 2, // E4, F4
        endMeasure: 1,
        endEvent: 1, // G4, A4
        anchorMeasure: 0,
        anchorEvent: 2,
        rangeMode: true,
      },
    });

    useEditorStore.getState().copySelection();

    const clipboard = useEditorStore.getState().clipboardEvents;
    expect(clipboard).not.toBeNull();
    expect(clipboard!.measures.length).toBe(2);
    // First group: events 2-3 from measure 0 (E4, F4)
    expect(clipboard!.measures[0].length).toBe(2);
    // Second group: events 0-1 from measure 1 (G4, A4)
    expect(clipboard!.measures[1].length).toBe(2);

    // Paste at measure 4, event 0
    useEditorStore.setState({
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 4, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      },
      noteSelection: null,
    });

    await useEditorStore.getState().pasteAtCursor();

    const result = useEditorStore.getState();
    // Measure 4 should get the 2 events from source measure 0's selection
    expect(result.score.parts[0].measures[4].voices[0].events.length).toBe(2);
    // Measure 5 should get the 2 events from source measure 1's selection
    expect(result.score.parts[0].measures[5].voices[0].events.length).toBe(2);
  });

  it("pasting multi-measure events replaces existing content via overwrite", async () => {
    // Put clipboard with 2 measures of data
    useEditorStore.setState({
      clipboardEvents: {
        voiceIndex: 0,
        measures: [
          [factory.rest(factory.dur("whole"))],
          [factory.rest(factory.dur("half")), factory.rest(factory.dur("half"))],
        ],
      },
      // Paste at measure 0 (which already has C D E F)
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      },
    });

    await useEditorStore.getState().pasteAtCursor();

    const result = useEditorStore.getState();
    const m0 = result.score.parts[0].measures[0].voices[0].events;
    const m1 = result.score.parts[0].measures[1].voices[0].events;

    // Measure 0: whole rest replaced the 4 quarter notes (overwrite mode)
    // The splice replaces min(1, 4) = 1 event, then remaining 3 are still there
    // Actually: splice(0, min(1,4), rest) = replaces 1 event with rest, so: rest + D4 + E4 + F4
    // The overwrite count = min(srcLen, destLen - offset)
    expect(m0[0].kind).toBe("rest");

    // Measure 1: 2 half rests replace first 2 of the 4 existing quarter notes
    expect(m1[0].kind).toBe("rest");
    expect(m1[1].kind).toBe("rest");
  });

  it("cursor lands on last pasted event in last destination measure", async () => {
    useEditorStore.setState({
      clipboardEvents: {
        voiceIndex: 0,
        measures: [
          [factory.note("C", 4, factory.dur("quarter"))],
          [factory.note("D", 4, factory.dur("quarter")), factory.note("E", 4, factory.dur("quarter"))],
        ],
      },
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 3, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      },
    });

    await useEditorStore.getState().pasteAtCursor();

    const cursor = useEditorStore.getState().inputState.cursor;
    // Should land on measure 4 (second destination measure)
    expect(cursor.measureIndex).toBe(4);
    // eventIndex should be at the last pasted event (index 1)
    expect(cursor.eventIndex).toBe(1);
  });
});
