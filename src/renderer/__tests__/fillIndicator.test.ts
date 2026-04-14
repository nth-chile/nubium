import { describe, it, expect } from "vitest";
import { measureCapacity, voiceTicksUsed } from "../../model/duration";
import type { NoteEvent } from "../../model/note";
import type { Measure } from "../../model/score";

/**
 * Tests for the overfill/underfill indicator displayed at top-right of
 * a measure (vexBridge.ts ~line 1203).
 *
 * Rules:
 *  - Show "+" (red) if voice has more ticks than measure capacity.
 *  - Show "−" (amber) if voice has fewer ticks than measure capacity.
 *  - Skip if measure is a pickup (intentionally underfilled).
 *  - Skip if voice has zero ticks (empty measures render with whole rest).
 */
function shouldShowIndicator(m: Pick<Measure, "timeSignature" | "voices" | "isPickup">): {
  show: boolean;
  kind?: "over" | "under";
} {
  if (m.isPickup) return { show: false };
  const capacity = measureCapacity(m.timeSignature.numerator, m.timeSignature.denominator);
  const maxTicks = Math.max(...m.voices.map((v) => voiceTicksUsed(v.events)), 0);
  if (maxTicks === 0 || maxTicks === capacity) return { show: false };
  return { show: true, kind: maxTicks > capacity ? "over" : "under" };
}

const mkEvent = (type: "whole" | "half" | "quarter" | "eighth", kind: "note" | "rest" = "note"): NoteEvent => ({
  kind,
  id: "evt" as never,
  duration: { type, dots: 0 },
  ...(kind === "note" ? { head: { pitch: { pitchClass: "C", accidental: "natural", octave: 4 } } } : {}),
} as NoteEvent);

describe("overfill/underfill indicator", () => {
  it("shows underfill for a partially filled 4/4 measure", () => {
    const m = {
      timeSignature: { numerator: 4, denominator: 4 },
      voices: [{ events: [mkEvent("quarter"), mkEvent("quarter")] }],
    } as Parameters<typeof shouldShowIndicator>[0];
    expect(shouldShowIndicator(m)).toEqual({ show: true, kind: "under" });
  });

  it("shows overfill when voice exceeds capacity", () => {
    const m = {
      timeSignature: { numerator: 4, denominator: 4 },
      voices: [{ events: [mkEvent("whole"), mkEvent("quarter")] }],
    } as Parameters<typeof shouldShowIndicator>[0];
    expect(shouldShowIndicator(m)).toEqual({ show: true, kind: "over" });
  });

  it("hides indicator for a fully filled 4/4 measure", () => {
    const m = {
      timeSignature: { numerator: 4, denominator: 4 },
      voices: [{ events: [mkEvent("whole")] }],
    } as Parameters<typeof shouldShowIndicator>[0];
    expect(shouldShowIndicator(m)).toEqual({ show: false });
  });

  it("hides indicator for an empty measure (zero ticks)", () => {
    const m = {
      timeSignature: { numerator: 4, denominator: 4 },
      voices: [{ events: [] }],
    } as Parameters<typeof shouldShowIndicator>[0];
    expect(shouldShowIndicator(m)).toEqual({ show: false });
  });

  it("hides indicator for pickup measure even if underfilled", () => {
    const m = {
      timeSignature: { numerator: 4, denominator: 4 },
      voices: [{ events: [mkEvent("quarter")] }],
      isPickup: true,
    } as Parameters<typeof shouldShowIndicator>[0];
    expect(shouldShowIndicator(m)).toEqual({ show: false });
  });

  it("takes the max ticks across all voices", () => {
    const m = {
      timeSignature: { numerator: 4, denominator: 4 },
      voices: [
        { events: [mkEvent("quarter")] },
        { events: [mkEvent("whole")] },
      ],
    } as Parameters<typeof shouldShowIndicator>[0];
    // Voice 2 is fully filled — no indicator
    expect(shouldShowIndicator(m)).toEqual({ show: false });
  });

  it("shows underfill in 3/4 when two quarters are present", () => {
    const m = {
      timeSignature: { numerator: 3, denominator: 4 },
      voices: [{ events: [mkEvent("quarter"), mkEvent("quarter")] }],
    } as Parameters<typeof shouldShowIndicator>[0];
    expect(shouldShowIndicator(m)).toEqual({ show: true, kind: "under" });
  });

  it("hides indicator in 3/4 when three quarters are present", () => {
    const m = {
      timeSignature: { numerator: 3, denominator: 4 },
      voices: [{ events: [mkEvent("quarter"), mkEvent("quarter"), mkEvent("quarter")] }],
    } as Parameters<typeof shouldShowIndicator>[0];
    expect(shouldShowIndicator(m)).toEqual({ show: false });
  });
});
