import { describe, it, expect } from "vitest";
import { applyAIEdit } from "../DiffApply";
import { factory } from "../../model";
import type { Score } from "../../model";

function makeScore(): Score {
  return factory.score("Test", "Composer", [
    factory.part("Piano", "Pno.", [
      factory.measure([
        factory.voice([
          factory.note("C", 4, factory.dur("quarter")),
          factory.note("D", 4, factory.dur("quarter")),
          factory.note("E", 4, factory.dur("quarter")),
          factory.note("F", 4, factory.dur("quarter")),
        ]),
      ]),
      factory.measure([
        factory.voice([
          factory.note("G", 4, factory.dur("quarter")),
          factory.note("A", 4, factory.dur("quarter")),
          factory.note("B", 4, factory.dur("quarter")),
          factory.note("C", 5, factory.dur("quarter")),
        ]),
      ]),
    ]),
  ]);
}

describe("applyAIEdit", () => {
  describe("patch format", () => {
    it("applies a single measure patch", () => {
      const score = makeScore();
      const patch = JSON.stringify({
        patch: [
          {
            part: 0,
            measure: 1,
            data: {
              clef: "treble",
              time: "4/4",
              key: 0,
              voices: [
                {
                  events: [
                    { type: "note", pitch: "E4", duration: "quarter" },
                    { type: "note", pitch: "F4", duration: "quarter" },
                    { type: "note", pitch: "G4", duration: "quarter" },
                    { type: "note", pitch: "A4", duration: "quarter" },
                  ],
                },
              ],
            },
          },
        ],
      });

      const result = applyAIEdit(score, patch);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const events = result.score.parts[0].measures[0].voices[0].events;
        expect(events).toHaveLength(4);
        if (events[0].kind === "note") {
          expect(events[0].head.pitch.pitchClass).toBe("E");
        }
      }
    });

    it("applies score-level changes (title, tempo)", () => {
      const score = makeScore();
      const patch = JSON.stringify({
        score: { title: "New Title", tempo: 140 },
        patch: [],
      });

      const result = applyAIEdit(score, patch);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.score.title).toBe("New Title");
        expect(result.score.tempo).toBe(140);
      }
    });

    it("extends measures if patch references beyond current length", () => {
      const score = makeScore();
      const patch = JSON.stringify({
        patch: [
          {
            part: 0,
            measure: 5,
            data: {
              clef: "treble",
              time: "4/4",
              key: 0,
              voices: [
                {
                  events: [
                    { type: "note", pitch: "C4", duration: "whole" },
                  ],
                },
              ],
            },
          },
        ],
      });

      const result = applyAIEdit(score, patch);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.score.parts[0].measures.length).toBeGreaterThanOrEqual(5);
      }
    });

    it("preserves measure IDs on patch", () => {
      const score = makeScore();
      const originalId = score.parts[0].measures[0].id;

      const patch = JSON.stringify({
        patch: [
          {
            part: 0,
            measure: 1,
            data: {
              clef: "treble",
              time: "4/4",
              key: 0,
              voices: [
                {
                  events: [{ type: "rest", duration: "whole" }],
                },
              ],
            },
          },
        ],
      });

      const result = applyAIEdit(score, patch);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.score.parts[0].measures[0].id).toBe(originalId);
      }
    });

    it("skips invalid part indices", () => {
      const score = makeScore();
      const patch = JSON.stringify({
        patch: [
          {
            part: 99,
            measure: 1,
            data: {
              clef: "treble",
              time: "4/4",
              key: 0,
              voices: [{ events: [{ type: "rest", duration: "whole" }] }],
            },
          },
        ],
      });

      const result = applyAIEdit(score, patch);
      expect(result.ok).toBe(true);
    });

    it("returns validation error for overfull measures", () => {
      const score = makeScore();
      const patch = JSON.stringify({
        patch: [
          {
            part: 0,
            measure: 1,
            data: {
              clef: "treble",
              time: "4/4",
              key: 0,
              voices: [
                {
                  events: [
                    { type: "note", pitch: "C4", duration: "whole" },
                    { type: "note", pitch: "D4", duration: "whole" },
                  ],
                },
              ],
            },
          },
        ],
      });

      const result = applyAIEdit(score, patch);
      expect(result.ok).toBe(false);
      if (!result.ok && "validationErrors" in result) {
        expect(result.validationErrors).toContain("ticks");
      }
    });
  });

  describe("full score replacement", () => {
    it("replaces entire score", () => {
      const score = makeScore();
      const newScore = JSON.stringify({
        title: "Replaced",
        composer: "New Author",
        tempo: 200,
        parts: [
          {
            name: "Guitar",
            abbreviation: "Gtr.",
            instrument: "guitar",
            measures: [
              {
                clef: "treble",
                time: "4/4",
                key: 0,
                voices: [
                  {
                    events: [{ type: "rest", duration: "whole" }],
                  },
                ],
              },
            ],
          },
        ],
      });

      const result = applyAIEdit(score, newScore);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.score.title).toBe("Replaced");
        expect(result.score.parts[0].name).toBe("Guitar");
        // Should preserve original score ID
        expect(result.score.id).toBe(score.id);
      }
    });

    it("pads parts to match original measure count", () => {
      const score = makeScore(); // has 2 measures
      const newScore = JSON.stringify({
        title: "Short",
        parts: [
          {
            name: "Piano",
            abbreviation: "Pno.",
            instrument: "piano",
            measures: [
              {
                clef: "treble",
                time: "4/4",
                key: 0,
                voices: [{ events: [{ type: "rest", duration: "whole" }] }],
              },
            ],
          },
        ],
      });

      const result = applyAIEdit(score, newScore);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.score.parts[0].measures.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("error handling", () => {
    it("returns error for invalid JSON", () => {
      const score = makeScore();
      const result = applyAIEdit(score, "not json at all");

      expect(result.ok).toBe(false);
      if (!result.ok && "error" in result) {
        expect(result.error).toContain("Failed to parse");
      }
    });

    it("returns error for malformed response", () => {
      const score = makeScore();
      const result = applyAIEdit(score, "{{{{");

      expect(result.ok).toBe(false);
      if (!result.ok && "error" in result) {
        expect(result.error).toContain("Failed to parse");
      }
    });
  });
});
