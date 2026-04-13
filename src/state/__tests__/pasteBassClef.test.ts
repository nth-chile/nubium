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

/**
 * Build a grand-staff score (piano-like) with two voices per measure:
 * voice 0 (staff 0 / treble): C4 D4 E4 F4
 * voice 1 (staff 1 / bass):   C3 D3 E3 F3
 */
function resetGrandStaffStore() {
  const score = factory.score("Grand Staff Test", "", [
    factory.part("Piano", "Pno.", [
      factory.measure([
        { ...factory.voice([
          factory.note("C", 4, factory.dur("quarter")),
          factory.note("D", 4, factory.dur("quarter")),
          factory.note("E", 4, factory.dur("quarter")),
          factory.note("F", 4, factory.dur("quarter")),
        ]), staff: 0 },
        { ...factory.voice([
          factory.note("C", 3, factory.dur("quarter")),
          factory.note("D", 3, factory.dur("quarter")),
          factory.note("E", 3, factory.dur("quarter")),
          factory.note("F", 3, factory.dur("quarter")),
        ]), staff: 1 },
      ]),
      factory.measure([
        { ...factory.voice([
          factory.note("G", 4, factory.dur("quarter")),
          factory.note("A", 4, factory.dur("quarter")),
          factory.note("B", 4, factory.dur("quarter")),
          factory.note("C", 5, factory.dur("quarter")),
        ]), staff: 0 },
        { ...factory.voice([
          factory.note("G", 2, factory.dur("quarter")),
          factory.note("A", 2, factory.dur("quarter")),
          factory.note("B", 2, factory.dur("quarter")),
          factory.note("C", 3, factory.dur("quarter")),
        ]), staff: 1 },
      ]),
      // Empty target measure with both staves
      factory.measure([
        { ...factory.voice([]), staff: 0 },
        { ...factory.voice([]), staff: 1 },
      ]),
    ], "piano"),
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

describe("Paste into bass clef (#235)", () => {
  beforeEach(() => {
    resetGrandStaffStore();
    mockClipboard.readText.mockRejectedValue(new Error("not available"));
  });

  it("paste with cursor on staveIndex 1 places notes into bass staff voice", async () => {
    // Copy some notes into clipboard (two quarter notes)
    const clipEvents = [
      factory.note("A", 2, factory.dur("quarter")),
      factory.note("B", 2, factory.dur("quarter")),
    ];
    useEditorStore.setState({
      clipboardEvents: {
        voiceIndex: 0,
        measures: [structuredClone(clipEvents)],
      },
      // Cursor on bass clef (staveIndex 1), measure 2 (the empty one)
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 2, voiceIndex: 1, eventIndex: 0, staveIndex: 1 },
      },
    });

    await useEditorStore.getState().pasteAtCursor();

    const result = useEditorStore.getState();
    const m2 = result.score.parts[0].measures[2];

    // Find the voice assigned to staff 1
    const bassVoices = m2.voices.filter((v) => (v.staff ?? 0) === 1);
    expect(bassVoices.length).toBeGreaterThanOrEqual(1);
    // Bass voice should now contain the pasted notes
    const bassEvents = bassVoices[0].events;
    expect(bassEvents.length).toBe(2);
    expect(bassEvents[0].kind).toBe("note");
    expect(bassEvents[1].kind).toBe("note");

    // Treble voice should remain empty (paste didn't go there)
    const trebleVoices = m2.voices.filter((v) => (v.staff ?? 0) === 0);
    expect(trebleVoices.length).toBeGreaterThanOrEqual(1);
    expect(trebleVoices[0].events.length).toBe(0);
  });

  it("paste with cursor on staveIndex 0 places notes into treble staff voice", async () => {
    const clipEvents = [
      factory.note("C", 5, factory.dur("quarter")),
    ];
    useEditorStore.setState({
      clipboardEvents: {
        voiceIndex: 0,
        measures: [structuredClone(clipEvents)],
      },
      // Cursor on treble clef (staveIndex 0), measure 2
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 2, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      },
    });

    await useEditorStore.getState().pasteAtCursor();

    const result = useEditorStore.getState();
    const m2 = result.score.parts[0].measures[2];

    // Treble voice should contain the pasted note
    const trebleVoices = m2.voices.filter((v) => (v.staff ?? 0) === 0);
    expect(trebleVoices.length).toBeGreaterThanOrEqual(1);
    expect(trebleVoices[0].events.length).toBe(1);
    expect(trebleVoices[0].events[0].kind).toBe("note");

    // Bass voice should remain empty
    const bassVoices = m2.voices.filter((v) => (v.staff ?? 0) === 1);
    expect(bassVoices.length).toBeGreaterThanOrEqual(1);
    expect(bassVoices[0].events.length).toBe(0);
  });

  it("paste replaces notes in bass staff when measure selection targets bass clef", async () => {
    // Put some notes in clipboard
    const clipEvents = [
      factory.note("F", 2, factory.dur("half")),
      factory.note("G", 2, factory.dur("half")),
    ];
    useEditorStore.setState({
      clipboardEvents: {
        voiceIndex: 0,
        measures: [structuredClone(clipEvents)],
      },
      // Measure selection on measure 1, cursor on bass staff
      selection: {
        partIndex: 0,
        measureStart: 1,
        measureEnd: 1,
        measureAnchor: 1,
      },
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 1, voiceIndex: 1, eventIndex: 0, staveIndex: 1 },
      },
    });

    await useEditorStore.getState().pasteAtCursor();

    const result = useEditorStore.getState();
    const m1 = result.score.parts[0].measures[1];

    // Bass voice should be replaced with clipboard content
    const bassVoices = m1.voices.filter((v) => (v.staff ?? 0) === 1);
    expect(bassVoices.length).toBeGreaterThanOrEqual(1);
    expect(bassVoices[0].events.length).toBe(2);

    // Treble voice should be untouched (still has original 4 notes)
    const trebleVoices = m1.voices.filter((v) => (v.staff ?? 0) === 0);
    expect(trebleVoices.length).toBeGreaterThanOrEqual(1);
    expect(trebleVoices[0].events.length).toBe(4);
  });

  it("cursor voiceIndex is updated to the bass staff flat voice index after paste", async () => {
    const clipEvents = [factory.note("E", 2, factory.dur("quarter"))];
    useEditorStore.setState({
      clipboardEvents: {
        voiceIndex: 0,
        measures: [structuredClone(clipEvents)],
      },
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 2, voiceIndex: 1, eventIndex: 0, staveIndex: 1 },
      },
    });

    await useEditorStore.getState().pasteAtCursor();

    const result = useEditorStore.getState();
    const cursor = result.inputState.cursor;
    // Cursor should remain on bass staff measure
    expect(cursor.measureIndex).toBe(2);
    // The voiceIndex should point to a voice on staff 1
    const destVoice = result.score.parts[0].measures[2].voices[cursor.voiceIndex];
    expect(destVoice).toBeDefined();
    expect(destVoice.staff ?? 0).toBe(1);
  });
});
