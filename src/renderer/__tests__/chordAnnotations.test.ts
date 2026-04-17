import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import type { Annotation } from "../../model/annotations";

/**
 * Tests for #220 — Chord symbols render on top visible part only.
 *
 * The ScoreRenderer filters chord-symbol annotations: only filteredPi === 0
 * (the topmost visible part) keeps its chord annotations. All other parts
 * have chord-symbol annotations stripped before rendering.
 *
 * Since the actual filtering is inline in the render loop, we test the
 * filtering pattern here to verify it behaves correctly for various
 * annotation combinations.
 */

/** Replicates the chord-symbol filtering logic from ScoreRenderer line ~394 */
function filterChordSymbolsForPart(
  annotations: Annotation[],
  filteredPartIndex: number,
): Annotation[] {
  if (filteredPartIndex > 0) {
    return annotations.filter((a) => a.kind !== "chord-symbol");
  }
  return annotations;
}

function chordAnnotation(text: string, beat = 0): Annotation {
  return { kind: "chord-symbol", text, beatOffset: beat } as Annotation;
}

function rehearsalAnnotation(label: string): Annotation {
  return { kind: "rehearsal-mark", text: label } as Annotation;
}

function dynamicAnnotation(level: string, noteEventId: string): Annotation {
  return { kind: "dynamic", level, noteEventId } as Annotation;
}

describe("chord symbol filtering for multi-part scores (#220)", () => {
  it("keeps chord symbols on the top visible part (index 0)", () => {
    const annotations: Annotation[] = [
      chordAnnotation("Cmaj7"),
      chordAnnotation("Dm7", 480),
      rehearsalAnnotation("A"),
    ];
    const filtered = filterChordSymbolsForPart(annotations, 0);
    expect(filtered).toHaveLength(3);
    expect(filtered.filter((a) => a.kind === "chord-symbol")).toHaveLength(2);
  });

  it("removes chord symbols from non-top parts (index > 0)", () => {
    const annotations: Annotation[] = [
      chordAnnotation("Cmaj7"),
      chordAnnotation("Dm7", 480),
      rehearsalAnnotation("A"),
    ];
    const filtered = filterChordSymbolsForPart(annotations, 1);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("rehearsal-mark");
  });

  it("preserves non-chord annotations on all parts", () => {
    const annotations: Annotation[] = [
      rehearsalAnnotation("B"),
      dynamicAnnotation("ff", "evt_1"),
      chordAnnotation("G7"),
    ];
    // Part index 2 (third part)
    const filtered = filterChordSymbolsForPart(annotations, 2);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((a) => a.kind)).toEqual(["rehearsal-mark", "dynamic"]);
  });

  it("returns empty array when only chord symbols exist on non-top part", () => {
    const annotations: Annotation[] = [
      chordAnnotation("Am"),
      chordAnnotation("F"),
    ];
    const filtered = filterChordSymbolsForPart(annotations, 3);
    expect(filtered).toHaveLength(0);
  });

  it("handles empty annotations array", () => {
    const filtered = filterChordSymbolsForPart([], 0);
    expect(filtered).toHaveLength(0);
  });

  it("multi-part scenario: only first part shows chords", () => {
    const score = factory.score("Test", "", [
      factory.part("Piano", "Pno.", [
        factory.measure([factory.voice([])], {
          annotations: [chordAnnotation("C"), rehearsalAnnotation("A")],
        }),
      ]),
      factory.part("Bass", "Bass", [
        factory.measure([factory.voice([])], {
          annotations: [chordAnnotation("C"), rehearsalAnnotation("A")],
        }),
      ]),
      factory.part("Drums", "Dr.", [
        factory.measure([factory.voice([])], {
          annotations: [chordAnnotation("C")],
        }),
      ]),
    ]);

    // Simulate what ScoreRenderer does: for each visible part index
    const results = score.parts.map((part, filteredPi) => ({
      partName: part.name,
      annotations: filterChordSymbolsForPart(
        part.measures[0].annotations,
        filteredPi,
      ),
    }));

    // Piano (index 0) keeps chord symbols
    expect(results[0].annotations.filter((a) => a.kind === "chord-symbol")).toHaveLength(1);
    // Bass (index 1) loses chord symbols but keeps rehearsal
    expect(results[1].annotations.filter((a) => a.kind === "chord-symbol")).toHaveLength(0);
    expect(results[1].annotations.filter((a) => a.kind === "rehearsal-mark")).toHaveLength(1);
    // Drums (index 2) loses chord symbols entirely
    expect(results[2].annotations).toHaveLength(0);
  });
});
