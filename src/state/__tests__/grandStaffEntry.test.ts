import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";

/**
 * Tests for #216 — Grand staff click → bass note entry.
 *
 * When the cursor is set to staveIndex: 1 (bass staff of a grand staff
 * instrument), insertNote should place the note into the bass voice, not
 * the treble voice. The cursor should also use the bass clef default
 * octave (3 instead of 4).
 */

function setupPianoScore() {
  // Piano with a single treble voice per measure — mimics a freshly created
  // grand staff score before any bass-staff notes have been entered.
  const score = factory.score("Test", "", [
    factory.part("Piano", "Pno.", [
      factory.measure([factory.voice([])]),
      factory.measure([factory.voice([])]),
    ], "piano"),
  ]);
  useEditorStore.setState((s) => ({
    score,
    inputState: {
      ...s.inputState,
      duration: { type: "quarter", dots: 0 },
      accidental: "natural",
      accidentalExplicit: false,
      voice: 0,
      cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      octave: 4,
      noteEntry: false,
      graceNoteMode: false,
      insertMode: false,
      pitchBeforeDuration: false,
      textInputMode: null,
      textInputBuffer: "",
      textInputInitialValue: "",
    },
  }));
}

describe("Grand staff bass note entry (#216)", () => {
  beforeEach(setupPianoScore);

  it("inserts a note into a new bass voice when cursor is on staveIndex 1", () => {
    // Simulate clicking on the bass staff — sets staveIndex to 1
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { ...s.inputState.cursor, staveIndex: 1 },
      },
    }));

    useEditorStore.getState().insertNote("C");

    const voices = useEditorStore.getState().score.parts[0].measures[0].voices;
    // A bass voice should have been created
    expect(voices.length).toBeGreaterThanOrEqual(2);
    const bassVoice = voices.find((v) => (v.staff ?? 0) === 1);
    expect(bassVoice).toBeDefined();
    expect(bassVoice!.events).toHaveLength(1);
    expect(bassVoice!.events[0].kind).toBe("note");
  });

  it("uses bass clef default octave (3) when inserting on staveIndex 1", () => {
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { ...s.inputState.cursor, staveIndex: 1 },
      },
    }));

    useEditorStore.getState().insertNote("C");

    const voices = useEditorStore.getState().score.parts[0].measures[0].voices;
    const bassVoice = voices.find((v) => (v.staff ?? 0) === 1);
    const evt = bassVoice!.events[0];
    if (evt.kind === "note") {
      expect(evt.head.pitch.octave).toBe(3);
    }
  });

  it("does not put notes in the treble voice when cursor is on bass staff", () => {
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { ...s.inputState.cursor, staveIndex: 1 },
      },
    }));

    useEditorStore.getState().insertNote("D");

    const trebleVoice = useEditorStore.getState().score.parts[0].measures[0].voices[0];
    expect(trebleVoice.events).toHaveLength(0);
  });

  it("reuses existing bass voice on subsequent inserts", () => {
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { ...s.inputState.cursor, staveIndex: 1 },
      },
    }));

    useEditorStore.getState().insertNote("C");
    useEditorStore.getState().insertNote("D");

    const voices = useEditorStore.getState().score.parts[0].measures[0].voices;
    // Still only 2 voices (treble + bass), not 3
    expect(voices).toHaveLength(2);
    const bassVoice = voices.find((v) => (v.staff ?? 0) === 1);
    expect(bassVoice!.events).toHaveLength(2);
  });

  it("cursor voiceIndex updates to the bass voice after insertion", () => {
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { ...s.inputState.cursor, staveIndex: 1 },
      },
    }));

    useEditorStore.getState().insertNote("E");

    const cursor = useEditorStore.getState().inputState.cursor;
    const voices = useEditorStore.getState().score.parts[0].measures[0].voices;
    const bassIdx = voices.findIndex((v) => (v.staff ?? 0) === 1);
    expect(cursor.voiceIndex).toBe(bassIdx);
  });

  it("treble staff entry still works normally after bass entry", () => {
    // Insert on bass first
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { ...s.inputState.cursor, staveIndex: 1 },
      },
    }));
    useEditorStore.getState().insertNote("C");

    // Switch back to treble
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { ...s.inputState.cursor, staveIndex: 0, voiceIndex: 0, eventIndex: 0 },
      },
    }));
    useEditorStore.getState().insertNote("G");

    const voices = useEditorStore.getState().score.parts[0].measures[0].voices;
    const trebleVoice = voices.find((v) => (v.staff ?? 0) === 0);
    expect(trebleVoice!.events).toHaveLength(1);
    if (trebleVoice!.events[0].kind === "note") {
      expect(trebleVoice!.events[0].head.pitch.pitchClass).toBe("G");
    }
  });
});

describe("Grand staff cursor navigation (#216)", () => {
  beforeEach(setupPianoScore);

  it("moveCursorPart down moves to staveIndex 1 for grand staff instrument", () => {
    useEditorStore.getState().moveCursorPart("down");

    const cursor = useEditorStore.getState().inputState.cursor;
    expect(cursor.staveIndex).toBe(1);
    expect(cursor.partIndex).toBe(0); // still on the same part
  });

  it("moveCursorPart up from staveIndex 1 returns to staveIndex 0", () => {
    // First go down to bass
    useEditorStore.getState().moveCursorPart("down");
    // Then go back up
    useEditorStore.getState().moveCursorPart("up");

    const cursor = useEditorStore.getState().inputState.cursor;
    expect(cursor.staveIndex).toBe(0);
    expect(cursor.partIndex).toBe(0);
  });
});
