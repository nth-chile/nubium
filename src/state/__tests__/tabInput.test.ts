import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";
import { STANDARD_TUNING, DROP_D_TUNING } from "../../model/guitar";

/**
 * Tests for #223 — Tab stave digit keys enter fret numbers, not durations.
 * Verifies insertTabNote behavior: fret+string → correct pitch, tabInfo,
 * cursor advancement, and fret buffer clearing.
 */

function setupTabScore(tuning = STANDARD_TUNING, capo = 0) {
  const score = factory.score("Tab Test", "", [
    factory.part("Guitar", "Gtr.", [
      factory.measure([
        factory.voice([
          factory.rest(factory.dur("whole")),
        ]),
      ]),
    ], "guitar"),
  ]);
  // Attach tuning/capo to the part
  (score.parts[0] as any).tuning = tuning;
  (score.parts[0] as any).capo = capo;

  useEditorStore.setState((s) => ({
    score,
    inputState: {
      ...s.inputState,
      duration: { type: "quarter", dots: 0 },
      accidental: "natural",
      voice: 0,
      cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      octave: 4,
      noteEntry: true,
      graceNoteMode: false,
      textInputMode: null,
      textInputBuffer: "",
      textInputInitialValue: "",
      tabInputActive: true,
      tabString: 1,
      tabFretBuffer: "",
      selectedHeadIndex: null,
    },
  }));
}

describe("insertTabNote — fret entry on tab stave (#223)", () => {
  beforeEach(() => setupTabScore());

  it("inserts fret 0 on string 1 (open high E) as E4", () => {
    useEditorStore.getState().insertTabNote(0, 1);
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      expect(evt.head.pitch.pitchClass).toBe("E");
      expect(evt.head.pitch.octave).toBe(4);
      expect(evt.head.tabInfo).toEqual({ string: 1, fret: 0 });
    }
  });

  it("inserts fret 5 on string 6 (low E, 5th fret = A2) as A", () => {
    useEditorStore.setState((s) => ({
      inputState: { ...s.inputState, tabString: 6 },
    }));
    useEditorStore.getState().insertTabNote(5, 6);
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      // String 6 open = E2 (MIDI 40), fret 5 = MIDI 45 = A2
      expect(evt.head.pitch.pitchClass).toBe("A");
      expect(evt.head.pitch.octave).toBe(2);
    }
  });

  it("inserts fret 12 on string 1 (12th fret high E = E5)", () => {
    useEditorStore.getState().insertTabNote(12, 1);
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      // String 1 open = E4 (MIDI 64), fret 12 = MIDI 76 = E5
      expect(evt.head.pitch.pitchClass).toBe("E");
      expect(evt.head.pitch.octave).toBe(5);
    }
  });

  it("advances cursor after insertion", () => {
    const cursorBefore = useEditorStore.getState().inputState.cursor.eventIndex;
    useEditorStore.getState().insertTabNote(0, 1);
    const cursorAfter = useEditorStore.getState().inputState.cursor.eventIndex;
    expect(cursorAfter).toBe(cursorBefore + 1);
  });

  it("clears tabFretBuffer after insertion", () => {
    useEditorStore.setState((s) => ({
      inputState: { ...s.inputState, tabFretBuffer: "1" },
    }));
    useEditorStore.getState().insertTabNote(12, 1);
    expect(useEditorStore.getState().inputState.tabFretBuffer).toBe("");
  });

  it("stores tabInfo on the inserted note", () => {
    useEditorStore.getState().insertTabNote(7, 3);
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      expect(evt.tabInfo).toEqual({ string: 3, fret: 7 });
    }
  });

  it("uses the current inputState duration", () => {
    useEditorStore.setState((s) => ({
      inputState: { ...s.inputState, duration: { type: "eighth", dots: 0 } },
    }));
    useEditorStore.getState().insertTabNote(3, 2);
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.duration.type).toBe("eighth");
  });
});

describe("insertTabNote with alternate tuning", () => {
  it("respects Drop D tuning on string 6 (open = D2)", () => {
    setupTabScore(DROP_D_TUNING);
    useEditorStore.getState().insertTabNote(0, 6);
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      // Drop D string 6 open = D2 (MIDI 38)
      expect(evt.head.pitch.pitchClass).toBe("D");
      expect(evt.head.pitch.octave).toBe(2);
    }
  });
});

describe("insertTabNote with capo", () => {
  it("adds capo offset to fret calculation", () => {
    setupTabScore(STANDARD_TUNING, 2);
    // String 1 open E4 (MIDI 64) + capo 2 + fret 0 = MIDI 66 = F#4
    useEditorStore.getState().insertTabNote(0, 1);
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      // MIDI 66 = F#4
      expect(evt.head.pitch.pitchClass).toBe("F");
      expect(evt.head.pitch.accidental).toBe("sharp");
      expect(evt.head.pitch.octave).toBe(4);
    }
  });
});
