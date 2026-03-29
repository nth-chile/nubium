import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { CommandHistory } from "../CommandHistory";
import { InsertNote } from "../InsertNote";
import { InsertRest } from "../InsertRest";
import { DeleteNote } from "../DeleteNote";
import { ChangePitch } from "../ChangePitch";
import { ChangeDuration } from "../ChangeDuration";
import { InsertMeasure } from "../InsertMeasure";
import { ToggleArticulation } from "../ToggleArticulation";
import { SetChordSymbol } from "../SetChordSymbol";
import { SetTempo } from "../SetTempo";
import { SetNavigationMark } from "../SetNavigationMark";
import { SetVolta } from "../SetVolta";
import { SetRepeatBarline } from "../SetRepeatBarline";
import { AddPart } from "../AddPart";
import { RemovePart } from "../RemovePart";
import { ReorderParts } from "../ReorderParts";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(): EditorSnapshot {
  return {
    score: factory.score("Test", "", [
      factory.part("Piano", "Pno.", [
        factory.measure([factory.voice([])]),
        factory.measure([factory.voice([])]),
      ]),
    ]),
    inputState: defaultInputState(),
  };
}

describe("CommandHistory", () => {
  it("reports canUndo/canRedo correctly", () => {
    const history = new CommandHistory();
    const snap = makeSnapshot();

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);

    const after = history.execute(new InsertNote("C", 4, "natural", factory.dur("quarter")), snap);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    history.undo(after);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
  });

  it("clears redo stack on new command", () => {
    const history = new CommandHistory();
    const snap = makeSnapshot();

    const r1 = history.execute(new InsertNote("C", 4, "natural", factory.dur("quarter")), snap);
    const r2 = history.undo(r1);
    expect(history.canRedo).toBe(true);

    // Execute a new command — redo should be cleared
    history.execute(new InsertRest(factory.dur("quarter")), r2!);
    expect(history.canRedo).toBe(false);
  });

  it("returns null when nothing to undo", () => {
    const history = new CommandHistory();
    const snap = makeSnapshot();
    expect(history.undo(snap)).toBeNull();
  });

  it("returns null when nothing to redo", () => {
    const history = new CommandHistory();
    const snap = makeSnapshot();
    expect(history.redo(snap)).toBeNull();
  });

  it("handles multiple undo/redo", () => {
    const history = new CommandHistory();
    const snap = makeSnapshot();

    const r1 = history.execute(new InsertNote("C", 4, "natural", factory.dur("quarter")), snap);
    const r2 = history.execute(new InsertNote("D", 4, "natural", factory.dur("quarter")), r1);
    const r3 = history.execute(new InsertNote("E", 4, "natural", factory.dur("quarter")), r2);

    expect(r3.score.parts[0].measures[0].voices[0].events).toHaveLength(3);

    const u1 = history.undo(r3)!;
    expect(u1.score.parts[0].measures[0].voices[0].events).toHaveLength(2);

    const u2 = history.undo(u1)!;
    expect(u2.score.parts[0].measures[0].voices[0].events).toHaveLength(1);

    const u3 = history.undo(u2)!;
    expect(u3.score.parts[0].measures[0].voices[0].events).toHaveLength(0);

    // Redo all
    const re1 = history.redo(u3)!;
    expect(re1.score.parts[0].measures[0].voices[0].events).toHaveLength(1);

    const re2 = history.redo(re1)!;
    expect(re2.score.parts[0].measures[0].voices[0].events).toHaveLength(2);

    const re3 = history.redo(re2)!;
    expect(re3.score.parts[0].measures[0].voices[0].events).toHaveLength(3);
  });
});

/** Strip all generated IDs for structural comparison (redo generates new IDs) */
function stripIds(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripIds);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "id") continue;
      result[k] = stripIds(v);
    }
    return result;
  }
  return obj;
}

describe("Undo/Redo for each command type", () => {
  function testUndoResto(name: string, setup: (snap: EditorSnapshot) => { history: CommandHistory; after: EditorSnapshot; before: EditorSnapshot }) {
    it(`undoes ${name}`, () => {
      const snap = makeSnapshot();
      const { history, after, before } = setup(snap);
      const undone = history.undo(after);
      expect(undone).not.toBeNull();
      expect(undone!.score).toEqual(before.score);
    });

    it(`redoes ${name}`, () => {
      const snap = makeSnapshot();
      const { history, after } = setup(snap);
      const undone = history.undo(after)!;
      const redone = history.redo(undone);
      expect(redone).not.toBeNull();
      // Redo re-executes the command, generating new IDs — compare structurally
      expect(stripIds(redone!.score)).toEqual(stripIds(after.score));
    });
  }

  testUndoResto("InsertNote", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new InsertNote("C", 4, "natural", factory.dur("quarter")), snap);
    return { history, after, before };
  });

  testUndoResto("InsertRest", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new InsertRest(factory.dur("quarter")), snap);
    return { history, after, before };
  });

  testUndoResto("DeleteNote", (snap) => {
    const history = new CommandHistory();
    // Insert a note first (outside of history tracking for this test)
    const withNote = new InsertNote("C", 4, "natural", factory.dur("quarter")).execute(snap);
    const before = structuredClone(withNote);
    const after = history.execute(new DeleteNote(), withNote);
    return { history, after, before };
  });

  testUndoResto("ChangePitch", (snap) => {
    const history = new CommandHistory();
    const withNote = new InsertNote("C", 4, "natural", factory.dur("quarter")).execute(snap);
    // Move cursor back to the note
    withNote.inputState.cursor.eventIndex = 0;
    const before = structuredClone(withNote);
    const after = history.execute(new ChangePitch("E", 5, "sharp"), withNote);
    return { history, after, before };
  });

  testUndoResto("ChangeDuration", (snap) => {
    const history = new CommandHistory();
    const withNote = new InsertNote("C", 4, "natural", factory.dur("quarter")).execute(snap);
    withNote.inputState.cursor.eventIndex = 0;
    const before = structuredClone(withNote);
    const after = history.execute(new ChangeDuration(factory.dur("half")), withNote);
    return { history, after, before };
  });

  testUndoResto("InsertMeasure", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new InsertMeasure(), snap);
    return { history, after, before };
  });

  testUndoResto("ToggleArticulation", (snap) => {
    const history = new CommandHistory();
    const withNote = new InsertNote("C", 4, "natural", factory.dur("quarter")).execute(snap);
    withNote.inputState.cursor.eventIndex = 0;
    const before = structuredClone(withNote);
    const after = history.execute(new ToggleArticulation("staccato"), withNote);
    return { history, after, before };
  });

  testUndoResto("SetChordSymbol", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new SetChordSymbol("Cmaj7", 0), snap);
    return { history, after, before };
  });

  testUndoResto("SetTempo", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new SetTempo(120), snap);
    return { history, after, before };
  });

  testUndoResto("SetNavigationMark", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new SetNavigationMark("coda"), snap);
    return { history, after, before };
  });

  testUndoResto("SetVolta", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new SetVolta({ endings: [1] }), snap);
    return { history, after, before };
  });

  testUndoResto("SetRepeatBarline", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new SetRepeatBarline("repeat-end"), snap);
    return { history, after, before };
  });

  testUndoResto("AddPart", (snap) => {
    const history = new CommandHistory();
    const before = structuredClone(snap);
    const after = history.execute(new AddPart("violin"), snap);
    return { history, after, before };
  });

  testUndoResto("RemovePart", (snap) => {
    const history = new CommandHistory();
    // Need 2 parts to remove one
    const withPart = new AddPart("violin").execute(snap);
    const before = structuredClone(withPart);
    const after = history.execute(new RemovePart(1), withPart);
    return { history, after, before };
  });

  testUndoResto("ReorderParts", (snap) => {
    const history = new CommandHistory();
    const withPart = new AddPart("violin").execute(snap);
    const before = structuredClone(withPart);
    const after = history.execute(new ReorderParts(0, "down"), withPart);
    return { history, after, before };
  });
});
