import type { Command, EditorSnapshot } from "./Command";

export class CommandHistory {
  private undoStack: { command: Command; before: EditorSnapshot }[] = [];
  private redoStack: { command: Command; before: EditorSnapshot }[] = [];
  private transactionStart: EditorSnapshot | null = null;
  private transactionDepth = 0;

  beginTransaction(state: EditorSnapshot): void {
    if (this.transactionDepth === 0) {
      this.transactionStart = structuredClone(state);
    }
    this.transactionDepth++;
  }

  endTransaction(): void {
    this.transactionDepth--;
    if (this.transactionDepth === 0 && this.transactionStart) {
      // Collapse all commands during transaction into one undo entry
      // Remove intermediate entries, keep only the transaction start snapshot
      const count = this.undoStack.length;
      // Find entries added during transaction and replace with single entry
      let firstIdx = count;
      for (let i = count - 1; i >= 0; i--) {
        if (this.undoStack[i].before === this.transactionStart) break;
        firstIdx = i;
      }
      if (firstIdx < count) {
        const last = this.undoStack[count - 1];
        this.undoStack.splice(firstIdx, count - firstIdx, {
          command: last.command,
          before: this.transactionStart,
        });
      }
      this.transactionStart = null;
    }
  }

  execute(command: Command, state: EditorSnapshot): EditorSnapshot {
    const before = this.transactionDepth > 0 && this.transactionStart
      ? this.transactionStart
      : structuredClone(state);
    const after = command.execute(state);
    this.undoStack.push({ command, before });
    this.redoStack = [];
    return after;
  }

  undo(currentState: EditorSnapshot): EditorSnapshot | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ command: entry.command, before: currentState });
    return entry.before;
  }

  redo(currentState: EditorSnapshot): EditorSnapshot | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    const after = entry.command.execute(currentState);
    this.undoStack.push({ command: entry.command, before: currentState });
    return after;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
