import type { NoteEvent } from "../model/note";
import type { TimeSignature } from "../model/time";
import { durationToTicks, TICKS_PER_QUARTER } from "../model/duration";
import type { DurationType } from "../model/duration";

/** Duration types that can be beamed (eighth notes and shorter). */
const BEAMABLE_DURATIONS: Set<DurationType> = new Set([
  "eighth",
  "16th",
  "32nd",
  "64th",
]);

function isBeamable(event: NoteEvent): boolean {
  if (event.kind === "rest") return false;
  return BEAMABLE_DURATIONS.has(event.duration.type);
}

const DOTTED_QUARTER = TICKS_PER_QUARTER + TICKS_PER_QUARTER / 2; // 720
const HALF = TICKS_PER_QUARTER * 2; // 960

/**
 * Returns an array of beat group sizes (in ticks) for one bar.
 * Asymmetric meters like 5/8 and 7/8 return unequal groups.
 *
 * - 2/2: half-note groups (960 ticks each)
 * - 4/4, 3/4, 2/4: quarter-note groups (480 ticks each)
 * - 6/8, 9/8, 12/8: dotted-quarter groups (720 ticks each)
 * - 5/8: 3+2 (720 + 480)
 * - 7/8: 2+2+3 (480 + 480 + 720)
 * - 3/8: one group of 720
 * - Others: quarter-note groups
 */
function beatGroupPattern(timeSig: TimeSignature): number[] {
  const { numerator, denominator } = timeSig;

  // Half-note denominators (2/2 cut time, 3/2, etc.)
  if (denominator === 2) {
    return Array(numerator).fill(HALF);
  }

  // Eighth-note denominators
  if (denominator === 8) {
    // Compound meters: divisible by 3
    if (numerator % 3 === 0) {
      return Array(numerator / 3).fill(DOTTED_QUARTER);
    }
    // Asymmetric meters
    if (numerator === 5) return [DOTTED_QUARTER, TICKS_PER_QUARTER]; // 3+2
    if (numerator === 7) return [TICKS_PER_QUARTER, TICKS_PER_QUARTER, DOTTED_QUARTER]; // 2+2+3
    // Other odd eighth-note meters: quarter-note groups
    return Array(Math.ceil(numerator / 2)).fill(TICKS_PER_QUARTER);
  }

  // Simple meters (denominator 4, 16, etc.): quarter-note groups
  return Array(numerator).fill(TICKS_PER_QUARTER);
}

/**
 * Returns groups of event indices that should be beamed together.
 *
 * Rules:
 * - Only eighth notes and shorter are beamed
 * - Don't beam across rests
 * - Group boundaries are determined by the time signature's beat grouping
 */
export function getBeamGroups(
  events: NoteEvent[],
  timeSig: TimeSignature
): number[][] {
  const pattern = beatGroupPattern(timeSig);
  const groups: number[][] = [];
  let currentGroup: number[] = [];
  let currentTick = 0;
  // Track which beat group we're in and its boundary
  let patternIdx = 0;
  let currentGroupStart = 0;
  let groupBoundary = pattern[0];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const ticks = durationToTicks(event.duration, event.tuplet);

    // If we've crossed a group boundary, flush and advance
    while (currentTick >= groupBoundary && patternIdx < pattern.length) {
      if (currentGroup.length >= 2) {
        groups.push(currentGroup);
      }
      currentGroup = [];
      currentGroupStart = groupBoundary;
      patternIdx++;
      // Cycle pattern for repeated bars or overflow
      const size = pattern[patternIdx % pattern.length];
      groupBoundary = currentGroupStart + size;
    }

    if (isBeamable(event)) {
      currentGroup.push(i);
    } else {
      // Non-beamable event breaks the beam group
      if (currentGroup.length >= 2) {
        groups.push(currentGroup);
      }
      currentGroup = [];
    }

    currentTick += ticks;
  }

  // Flush remaining group
  if (currentGroup.length >= 2) {
    groups.push(currentGroup);
  }

  return groups;
}
