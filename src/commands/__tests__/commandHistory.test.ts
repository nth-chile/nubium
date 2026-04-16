import { describe, it, expect } from "vitest";
import { CommandHistory } from "../CommandHistory";
import type { Command, EditorSnapshot } from "../Command";
import { factory } from "../../model";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(): EditorSnapshot {
  return {
    score: factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([])])]),
    ]),
    inputState: defaultInputState(),
  };
}

function makeCommand(desc: string, transform: (s: EditorSnapshot) => EditorSnapshot): Command {
  return {
    description: desc,
    execute: transform,
    undo: (s) => s,
  };
}

describe("CommandHistory", () => {
  it("starts with nothing to undo or redo", () => {
    const history = new CommandHistory();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("execute pushes onto undo stack", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();
    const cmd = makeCommand("set title", (s) => ({
      ...s,
      score: { ...s.score, title: "New Title" },
    }));

    const after = history.execute(cmd, state);
    expect(after.score.title).toBe("New Title");
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("undo restores previous state", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();
    const cmd = makeCommand("set title", (s) => ({
      ...s,
      score: { ...s.score, title: "Changed" },
    }));

    const after = history.execute(cmd, state);
    expect(after.score.title).toBe("Changed");

    const undone = history.undo(after);
    expect(undone).not.toBeNull();
    expect(undone!.score.title).toBe("Test");
    expect(history.canRedo).toBe(true);
  });

  it("redo replays command", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();
    const cmd = makeCommand("set title", (s) => ({
      ...s,
      score: { ...s.score, title: "Changed" },
    }));

    const after = history.execute(cmd, state);
    const undone = history.undo(after)!;
    const redone = history.redo(undone);

    expect(redone).not.toBeNull();
    expect(redone!.score.title).toBe("Changed");
  });

  it("execute clears redo stack", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();

    const cmd1 = makeCommand("cmd1", (s) => ({ ...s, score: { ...s.score, title: "A" } }));
    const cmd2 = makeCommand("cmd2", (s) => ({ ...s, score: { ...s.score, title: "B" } }));

    const after1 = history.execute(cmd1, state);
    history.undo(after1);
    expect(history.canRedo).toBe(true);

    history.execute(cmd2, state);
    expect(history.canRedo).toBe(false);
  });

  it("undo returns null when stack is empty", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();
    expect(history.undo(state)).toBeNull();
  });

  it("redo returns null when stack is empty", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();
    expect(history.redo(state)).toBeNull();
  });

  it("pushSnapshot enables undo without a command", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();
    history.pushSnapshot(state);

    const modified = { ...state, score: { ...state.score, title: "Modified" } };
    const undone = history.undo(modified);
    expect(undone).not.toBeNull();
    expect(undone!.score.title).toBe("Test");
  });

  it("transaction collapses multiple commands into one undo", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();

    history.beginTransaction(state);

    const after1 = history.execute(
      makeCommand("cmd1", (s) => ({ ...s, score: { ...s.score, title: "Step1" } })),
      state,
    );
    const after2 = history.execute(
      makeCommand("cmd2", (s) => ({ ...s, score: { ...s.score, title: "Step2" } })),
      after1,
    );

    history.endTransaction();

    // One undo should restore to pre-transaction state
    const undone = history.undo(after2);
    expect(undone).not.toBeNull();
    expect(undone!.score.title).toBe("Test");

    // No more undo available
    expect(history.canUndo).toBe(false);
  });

  it("nested transactions only collapse at outermost level", () => {
    const history = new CommandHistory();
    const state = makeSnapshot();

    history.beginTransaction(state);
    history.execute(
      makeCommand("cmd1", (s) => ({ ...s, score: { ...s.score, title: "A" } })),
      state,
    );

    history.beginTransaction(state); // nested
    const after2 = history.execute(
      makeCommand("cmd2", (s) => ({ ...s, score: { ...s.score, title: "B" } })),
      state,
    );
    history.endTransaction(); // inner
    history.endTransaction(); // outer

    // Still one undo to restore everything
    const undone = history.undo(after2);
    expect(undone).not.toBeNull();
    expect(history.canUndo).toBe(false);
  });
});
