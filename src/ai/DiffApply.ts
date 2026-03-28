import type { Score, Measure } from "../model";
import { newId, type PartId, type MeasureId, type VoiceId } from "../model/ids";
import { durationToTicks, measureCapacity } from "../model/duration";
import { parseMeasure, jsonToScore } from "../serialization";
import { validateMeasure, formatValidationErrors, type ValidationError } from "./validate";

export interface ApplyResult {
  ok: true;
  score: Score;
}

export interface ApplyValidationError {
  ok: false;
  validationErrors: string;
}

export interface ApplyError {
  ok: false;
  error: string;
}

export type ApplyOutcome = ApplyResult | ApplyValidationError | ApplyError;

/**
 * Trim voices in a measure so they don't exceed the time signature's capacity.
 * Extra events are silently dropped.
 */
function enforceCapacity(m: Measure): void {
  const cap = measureCapacity(m.timeSignature.numerator, m.timeSignature.denominator);
  for (const voice of m.voices) {
    let used = 0;
    let cutIdx = voice.events.length;
    for (let i = 0; i < voice.events.length; i++) {
      const ticks = durationToTicks(voice.events[i].duration);
      if (used + ticks > cap) {
        cutIdx = i;
        break;
      }
      used += ticks;
    }
    if (cutIdx < voice.events.length) {
      voice.events.splice(cutIdx);
    }
  }
}

/**
 * Applies a patch-based AI edit to the current score.
 * Supports: { patch: [...] }, { score: {...}, patch: [...] }, { addParts: [...] }
 * Falls back to full-score replacement if the response looks like a complete score.
 */
export function applyAIEdit(
  currentScore: Score,
  responseText: string
): ApplyOutcome {
  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;

    // Detect patch format
    if (Array.isArray(parsed.patch)) {
      const score = structuredClone(currentScore);
      const allErrors: ValidationError[] = [];

      // Apply score-level changes
      if (parsed.score && typeof parsed.score === "object") {
        const s = parsed.score as Record<string, unknown>;
        if (s.title !== undefined) score.title = s.title as string;
        if (s.composer !== undefined) score.composer = s.composer as string;
        if (s.tempo !== undefined) score.tempo = s.tempo as number;
      }

      // Apply measure patches
      for (const entry of parsed.patch as Record<string, unknown>[]) {
        const partIdx = (entry.part as number) ?? 0;
        const measureNum = (entry.measure as number) ?? 1;
        const measureIdx = measureNum - 1;
        const data = entry.data as Record<string, unknown>;

        if (!data || !score.parts[partIdx]) continue;

        const part = score.parts[partIdx];

        // Extend measures array if needed
        while (part.measures.length <= measureIdx) {
          part.measures.push({
            id: newId<MeasureId>("msr"),
            clef: { type: "treble" },
            timeSignature: { numerator: 4, denominator: 4 },
            keySignature: { fifths: 0 },
            barlineEnd: "single",
            annotations: [],
            voices: [{ id: newId<VoiceId>("vce"), events: [] }],
          });
        }

        // Replace the measure, preserving the ID
        const oldId = part.measures[measureIdx].id;
        part.measures[measureIdx] = parseMeasure(data);
        part.measures[measureIdx].id = oldId;

        // Validate
        const errors = validateMeasure(part.measures[measureIdx], measureNum, partIdx);
        allErrors.push(...errors);
      }

      // If there are validation errors, return them for AI retry
      if (allErrors.length > 0) {
        // Apply trimming as fallback so the score is at least usable
        for (const part of score.parts) {
          for (const m of part.measures) {
            enforceCapacity(m);
          }
        }
        return {
          ok: false,
          validationErrors: formatValidationErrors(allErrors),
        } as ApplyValidationError;
      }

      return { ok: true, score };
    }

    // Full score replacement (structural changes like removing/adding parts)
    const newScore = jsonToScore(parsed);
    newScore.id = currentScore.id;

    // Pad all parts to at least the current score's measure count
    const targetLen = currentScore.parts[0]?.measures.length ?? 32;
    for (const part of newScore.parts) {
      while (part.measures.length < targetLen) {
        part.measures.push({
          id: newId<MeasureId>("msr"),
          clef: { type: "treble" },
          timeSignature: { numerator: 4, denominator: 4 },
          keySignature: { fifths: 0 },
          barlineEnd: "single",
          annotations: [],
          voices: [{ id: newId<VoiceId>("vce"), events: [] }],
        });
      }
    }

    const allErrors: ValidationError[] = [];
    for (let pi = 0; pi < newScore.parts.length; pi++) {
      for (let mi = 0; mi < newScore.parts[pi].measures.length; mi++) {
        const errors = validateMeasure(newScore.parts[pi].measures[mi], mi + 1, pi);
        allErrors.push(...errors);
      }
    }
    if (allErrors.length > 0) {
      for (const part of newScore.parts) {
        for (const m of part.measures) {
          enforceCapacity(m);
        }
      }
      return { ok: false, validationErrors: formatValidationErrors(allErrors) } as ApplyValidationError;
    }
    return { ok: true, score: newScore };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parse error";
    return {
      ok: false,
      error: `Failed to parse AI output: ${message}`,
    };
  }
}
