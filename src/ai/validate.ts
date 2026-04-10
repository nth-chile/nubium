/**
 * Validates AI-generated measures and returns specific error descriptions
 * that can be fed back to the AI for correction.
 */
import type { Measure } from "../model";
import type { NoteEvent } from "../model/note";
import { durationToTicks, measureCapacity } from "../model/duration";

const VALID_PITCH_CLASSES = new Set<string>(["C", "D", "E", "F", "G", "A", "B"]);
const VALID_DURATIONS = new Set<string>([
  "whole", "half", "quarter", "eighth", "16th", "32nd", "64th",
]);

export interface ValidationError {
  measureNumber: number;
  partIndex: number;
  voiceIndex: number;
  message: string;
}

function validateEvent(event: NoteEvent, _eventIndex: number): string | null {
  // Check duration type
  if (!VALID_DURATIONS.has(event.duration.type)) {
    return `Invalid duration "${event.duration.type}". Valid: whole, half, quarter, eighth, 16th, 32nd, 64th`;
  }

  // Check dots
  if (event.duration.dots < 0 || event.duration.dots > 3) {
    return `Invalid dot count ${event.duration.dots}. Must be 0-3`;
  }

  if (event.kind === "note") {
    if (!VALID_PITCH_CLASSES.has(event.head.pitch.pitchClass)) {
      return `Invalid pitch class "${event.head.pitch.pitchClass}"`;
    }
    if (event.head.pitch.octave < 0 || event.head.pitch.octave > 9) {
      return `Invalid octave ${event.head.pitch.octave}. Must be 0-9`;
    }
  }

  if (event.kind === "chord") {
    for (const head of event.heads) {
      if (!VALID_PITCH_CLASSES.has(head.pitch.pitchClass)) {
        return `Invalid pitch class "${head.pitch.pitchClass}" in chord`;
      }
      if (head.pitch.octave < 0 || head.pitch.octave > 9) {
        return `Invalid octave ${head.pitch.octave} in chord. Must be 0-9`;
      }
    }
  }

  return null;
}

export function validateMeasure(
  m: Measure,
  measureNumber: number,
  partIndex: number
): ValidationError[] {
  const errors: ValidationError[] = [];
  const cap = measureCapacity(m.timeSignature.numerator, m.timeSignature.denominator);

  for (let vi = 0; vi < m.voices.length; vi++) {
    const voice = m.voices[vi];

    // Validate individual events
    for (let ei = 0; ei < voice.events.length; ei++) {
      const err = validateEvent(voice.events[ei], ei);
      if (err) {
        errors.push({
          measureNumber,
          partIndex,
          voiceIndex: vi,
          message: `Event ${ei + 1}: ${err}`,
        });
      }
    }

    // Check capacity
    const used = voice.events.reduce(
      (sum, e) => sum + durationToTicks(e.duration),
      0
    );

    if (used > cap) {
      const overBy = used - cap;
      errors.push({
        measureNumber,
        partIndex,
        voiceIndex: vi,
        message: `Voice ${vi + 1} has ${used} ticks but measure capacity is ${cap} ticks (over by ${overBy}). Remove ${overBy} ticks of notes/rests.`,
      });
    }
    // Underfill is not an error — pickup measures, incomplete bars are valid music
  }

  return errors;
}

/**
 * Formats validation errors into a message the AI can understand and fix.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return "";

  const lines = errors.map(
    (e) => `- Measure ${e.measureNumber}, part ${e.partIndex}: ${e.message}`
  );

  return `Your edit has ${errors.length} issue${errors.length === 1 ? "" : "s"}:\n${lines.join("\n")}\n\nPlease fix and return a corrected JSON patch.`;
}
