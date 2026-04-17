import { describe, it, expect } from "vitest";
import { computeCursorX } from "../ScoreRenderer";
import type { NoteBox } from "../vexBridge";
import type { NoteEventId } from "../../model";

function box(id: string, x: number, width: number, staveIndex = 0): NoteBox {
  return {
    id: id as NoteEventId,
    x,
    y: 0,
    width,
    height: 40,
    headX: x,
    headY: 0,
    headWidth: width,
    headHeight: 40,
    partIndex: 0,
    measureIndex: 0,
    voiceIndex: 0,
    eventIndex: 0,
    staveIndex,
  };
}

describe("computeCursorX", () => {
  const ids = ["e0", "e1", "e2", "e3"] as NoteEventId[];

  it("centers the caret on the target box when the event is visible", () => {
    const target = box("e1", 100, 20);
    const x = computeCursorX(target, 1, 0, ids, [], undefined, 50);
    expect(x).toBe(110); // headX + headWidth / 2
  });

  it("uses noteStartX + 10 when the measure has no visible events", () => {
    const x = computeCursorX(undefined, 0, 0, ids, [], new Map(), 50);
    expect(x).toBe(60);
  });

  it("at append position, places caret just after the LAST visible note", () => {
    const hit = [box("e0", 100, 20), box("e3", 300, 20)];
    const x = computeCursorX(undefined, 4, 0, ids, hit, undefined, 50);
    expect(x).toBe(330); // after e3 (the last visible event)
  });

  it("on a rest between notes, places caret after the PREVIOUS visible note (not end of bar)", () => {
    // e0 is a visible note at x=100; e1 is a rest (no box); e2 is a note at x=200; e3 is a note at x=300
    // Cursor on e1 (the rest): caret should be after e0, NOT after e3.
    const hit = [box("e0", 100, 20), box("e2", 200, 20), box("e3", 300, 20)];
    const x = computeCursorX(undefined, 1, 0, ids, hit, undefined, 50);
    expect(x).toBe(130); // after e0 (100 + 20 + 10)
  });

  it("on a rest at index 0 (no previous visible event), falls back to noteStartX + 10", () => {
    const hit = [box("e1", 200, 20), box("e2", 300, 20)];
    const x = computeCursorX(undefined, 0, 0, ids, hit, undefined, 50);
    expect(x).toBe(60); // noteStartX + 10
  });

  it("prefers hitBoxes on the same stave over noteBoxes map", () => {
    const hit = [box("e0", 100, 20, 1)]; // stave 1
    const fallback = new Map<NoteEventId, NoteBox>([
      ["e0" as NoteEventId, box("e0", 500, 20, 0)], // stave 0 in noteBoxes map
    ]);
    // Cursor on stave 1, append position — should use hitBoxes' stave-1 entry
    const x = computeCursorX(undefined, 1, 1, ids, hit, fallback, 50);
    expect(x).toBe(130);
  });

  it("falls back to noteBoxes map when hitBoxes has no match on the cursor's stave", () => {
    const hit: NoteBox[] = []; // no hitBoxes
    const fallback = new Map<NoteEventId, NoteBox>([
      ["e0" as NoteEventId, box("e0", 100, 20, 0)],
    ]);
    const x = computeCursorX(undefined, 1, 0, ids, hit, fallback, 50);
    expect(x).toBe(130);
  });
});
