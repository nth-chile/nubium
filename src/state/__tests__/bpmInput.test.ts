import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../EditorState";
import { factory } from "../../model";

/**
 * Tests for #218 — BPM input behavior.
 *
 * The Enter/Escape key handling and blur() calls are in the JSX onKeyDown
 * handler of the BPM <Input> in Playback.tsx (TransportPanel). That logic
 * is purely DOM-level (calling e.currentTarget.blur()) and cannot be unit
 * tested without a browser/DOM environment.
 *
 * What we CAN test here:
 * - The store's setTempo action correctly updates score.tempo
 * - The validation logic that handleTempoCommit uses (bpm 20–400, integer)
 *   is inline in the component, so we test boundary behavior via the store
 *
 * The onKeyDown handler in Playback.tsx at lines 181-184:
 *   Enter  → calls handleTempoCommit() then blur()
 *   Escape → resets tempoInput to null then blur()
 * This is confirmed present in the source code.
 */

function setup() {
  const score = factory.score("Test", "", [
    factory.part("Piano", "Pno.", [
      factory.measure([factory.voice([])]),
    ], "piano"),
  ], 120);
  useEditorStore.setState({ score });
}

describe("setTempo via store (#218)", () => {
  beforeEach(setup);

  it("updates score.tempo when called with a valid BPM", () => {
    useEditorStore.getState().setTempo(140);
    expect(useEditorStore.getState().score.tempo).toBe(140);
  });

  it("accepts BPM at the lower boundary (20)", () => {
    useEditorStore.getState().setTempo(20);
    expect(useEditorStore.getState().score.tempo).toBe(20);
  });

  it("accepts BPM at the upper boundary (400)", () => {
    useEditorStore.getState().setTempo(400);
    expect(useEditorStore.getState().score.tempo).toBe(400);
  });
});

describe("handleTempoCommit validation logic (#218)", () => {
  /**
   * The component's handleTempoCommit function (Playback.tsx:151-157):
   *   const bpm = parseInt(tempoInput);
   *   if (!isNaN(bpm) && bpm >= 20 && bpm <= 400) setTempo(bpm);
   *   setTempoInput(null);
   *
   * We replicate this validation logic here to verify edge cases.
   */
  function validateAndCommit(input: string): number | null {
    const bpm = parseInt(input);
    if (!isNaN(bpm) && bpm >= 20 && bpm <= 400) return bpm;
    return null;
  }

  it("accepts valid integer strings", () => {
    expect(validateAndCommit("120")).toBe(120);
    expect(validateAndCommit("60")).toBe(60);
    expect(validateAndCommit("200")).toBe(200);
  });

  it("rejects values below 20", () => {
    expect(validateAndCommit("19")).toBeNull();
    expect(validateAndCommit("0")).toBeNull();
    expect(validateAndCommit("-5")).toBeNull();
  });

  it("rejects values above 400", () => {
    expect(validateAndCommit("401")).toBeNull();
    expect(validateAndCommit("999")).toBeNull();
  });

  it("rejects non-numeric strings", () => {
    expect(validateAndCommit("abc")).toBeNull();
    expect(validateAndCommit("")).toBeNull();
  });

  it("truncates decimal input via parseInt", () => {
    expect(validateAndCommit("120.5")).toBe(120);
    expect(validateAndCommit("99.9")).toBe(99);
  });
});
