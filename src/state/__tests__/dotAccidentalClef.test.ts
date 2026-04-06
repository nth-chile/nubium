import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";

/**
 * Tests for:
 * - toggleDot() modifying the note at cursor (#95)
 * - setAccidental() modifying the note at cursor (#95)
 * - Clef-aware octave in insertNote() (#119)
 */

function setupScore() {
  const score = factory.score("Test", "", [
    factory.part("Piano", "Pno.", [
      factory.measure([
        factory.voice([
          factory.note("C", 4, factory.dur("quarter")),
          factory.note("D", 4, factory.dur("quarter")),
        ]),
      ]),
    ]),
  ]);
  useEditorStore.setState((s) => ({
    score,
    inputState: {
      ...s.inputState,
      duration: { type: "quarter", dots: 0 },
      accidental: "natural",
      voice: 0,
      cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
      octave: 4,
      stepEntry: false,
      graceNoteMode: false,
      textInputMode: null,
      textInputBuffer: "",
      textInputInitialValue: "",
    },
  }));
}

describe("toggleDot on existing note (#95)", () => {
  beforeEach(setupScore);

  it("adds a dot to the note at cursor", () => {
    useEditorStore.getState().toggleDot();
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.duration.dots).toBe(1);
  });

  it("cycles dots: 0 → 1 → 2 → 3 → 0", () => {
    const store = useEditorStore.getState();
    store.toggleDot(); // 1
    store.toggleDot(); // 2
    store.toggleDot(); // 3
    const evt3 = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt3.duration.dots).toBe(3);

    store.toggleDot(); // back to 0
    const evt0 = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt0.duration.dots).toBe(0);
  });

  it("also updates inputState duration dots", () => {
    useEditorStore.getState().toggleDot();
    expect(useEditorStore.getState().inputState.duration.dots).toBe(1);
  });

  it("only updates inputState when cursor is past end (no note)", () => {
    // Move cursor past the last event
    useEditorStore.setState((s) => ({
      inputState: {
        ...s.inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 2, staveIndex: 0 },
      },
    }));
    useEditorStore.getState().toggleDot();
    // Note at index 0 should be unchanged
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.duration.dots).toBe(0);
    // But inputState should update
    expect(useEditorStore.getState().inputState.duration.dots).toBe(1);
  });
});

describe("setAccidental on existing note (#95)", () => {
  beforeEach(setupScore);

  it("sets sharp on note at cursor", () => {
    useEditorStore.getState().setAccidental("sharp");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      expect(evt.head.pitch.accidental).toBe("sharp");
    }
  });

  it("toggles back to natural when pressing same accidental", () => {
    const store = useEditorStore.getState();
    store.setAccidental("flat");
    store.setAccidental("flat"); // toggle off
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "note") {
      expect(evt.head.pitch.accidental).toBe("natural");
    }
  });

  it("sets accidental on chord heads", () => {
    // Replace first event with a chord
    const score = structuredClone(useEditorStore.getState().score);
    score.parts[0].measures[0].voices[0].events[0] = factory.chord(
      [factory.noteHead("C", 4), factory.noteHead("E", 4)],
      factory.dur("quarter"),
    );
    useEditorStore.setState({ score });

    useEditorStore.getState().setAccidental("sharp");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "chord") {
      expect(evt.heads[0].pitch.accidental).toBe("sharp");
      expect(evt.heads[1].pitch.accidental).toBe("sharp");
    }
  });

  it("does not modify rests", () => {
    // Replace first event with a rest
    const score = structuredClone(useEditorStore.getState().score);
    score.parts[0].measures[0].voices[0].events[0] = factory.rest(factory.dur("quarter"));
    useEditorStore.setState({ score });

    useEditorStore.getState().setAccidental("sharp");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("rest");
    // inputState should still update
    expect(useEditorStore.getState().inputState.accidental).toBe("sharp");
  });
});

describe("setAccidental on grace notes (#95)", () => {
  beforeEach(setupScore);

  it("sets sharp on a grace note at cursor", () => {
    // Replace first event with a grace note
    const score = structuredClone(useEditorStore.getState().score);
    score.parts[0].measures[0].voices[0].events[0] = factory.graceNote("B", 3);
    useEditorStore.setState({ score });

    useEditorStore.getState().setAccidental("sharp");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("grace");
    if (evt.kind === "grace") {
      expect(evt.head.pitch.accidental).toBe("sharp");
    }
  });
});

describe("toggleDot on grace notes (#95)", () => {
  beforeEach(setupScore);

  it("adds a dot to a grace note at cursor", () => {
    const score = structuredClone(useEditorStore.getState().score);
    score.parts[0].measures[0].voices[0].events[0] = factory.graceNote("B", 3);
    useEditorStore.setState({ score });

    useEditorStore.getState().toggleDot();
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.duration.dots).toBe(1);
  });
});

describe("Clef-aware octave in ChangePitch (#119)", () => {
  it("changes pitch at bass clef octave when cursor is on existing note", () => {
    const score = factory.score("Test", "", [
      factory.part("Cello", "Vc.", [
        factory.measure([factory.voice([
          factory.note("C", 4, factory.dur("quarter")),
        ])], { clef: { type: "bass" } }),
      ]),
    ]);
    useEditorStore.setState({
      score,
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
        octave: 4,
      },
    });

    // Pressing D on an existing note triggers ChangePitch, not InsertNote
    useEditorStore.getState().insertNote("D");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "note") {
      expect(evt.head.pitch.pitchClass).toBe("D");
      expect(evt.head.pitch.octave).toBe(3); // bass clef offset applied
    }
  });
});

describe("Clef-aware octave in insertNote (#119)", () => {
  it("inserts at octave 3 in bass clef (default octave 4)", () => {
    const score = factory.score("Test", "", [
      factory.part("Cello", "Vc.", [
        factory.measure([factory.voice([])], { clef: { type: "bass" } }),
      ]),
    ]);
    useEditorStore.setState({
      score,
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
        octave: 4,
      },
    });

    useEditorStore.getState().insertNote("C");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("note");
    if (evt.kind === "note") {
      expect(evt.head.pitch.octave).toBe(3);
      expect(evt.head.pitch.pitchClass).toBe("C");
    }
  });

  it("inserts at octave 4 in treble clef (default)", () => {
    const score = factory.score("Test", "", [
      factory.part("Piano", "Pno.", [
        factory.measure([factory.voice([])], { clef: { type: "treble" } }),
      ]),
    ]);
    useEditorStore.setState({
      score,
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
        octave: 4,
      },
    });

    useEditorStore.getState().insertNote("C");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "note") {
      expect(evt.head.pitch.octave).toBe(4);
    }
  });

  it("smart octave picks closest to previous note in bass clef", () => {
    const score = factory.score("Test", "", [
      factory.part("Cello", "Vc.", [
        factory.measure([factory.voice([
          factory.note("G", 3, factory.dur("quarter")),
        ])], { clef: { type: "bass" } }),
      ]),
    ]);
    useEditorStore.setState({
      score,
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 1, staveIndex: 0 },
        octave: 4,
      },
    });

    // Inserting C after G3 should pick C4 (closest to G3)
    useEditorStore.getState().insertNote("C");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[1];
    if (evt.kind === "note") {
      expect(evt.head.pitch.octave).toBe(4);
    }
  });

  it("inserts at octave 3 in tenor clef", () => {
    const score = factory.score("Test", "", [
      factory.part("Trombone", "Tbn.", [
        factory.measure([factory.voice([])], { clef: { type: "tenor" } }),
      ]),
    ]);
    useEditorStore.setState({
      score,
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
        octave: 4,
      },
    });

    useEditorStore.getState().insertNote("C");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "note") {
      expect(evt.head.pitch.octave).toBe(3);
    }
  });

  it("inserts at octave 4 in alto clef (same as treble default)", () => {
    const score = factory.score("Test", "", [
      factory.part("Viola", "Vla.", [
        factory.measure([factory.voice([])], { clef: { type: "alto" } }),
      ]),
    ]);
    useEditorStore.setState({
      score,
      inputState: {
        ...useEditorStore.getState().inputState,
        cursor: { partIndex: 0, measureIndex: 0, voiceIndex: 0, eventIndex: 0, staveIndex: 0 },
        octave: 4,
      },
    });

    useEditorStore.getState().insertNote("C");
    const evt = useEditorStore.getState().score.parts[0].measures[0].voices[0].events[0];
    if (evt.kind === "note") {
      expect(evt.head.pitch.octave).toBe(4);
    }
  });
});
