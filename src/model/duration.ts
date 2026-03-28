export type DurationType =
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "16th"
  | "32nd"
  | "64th";

export interface Duration {
  type: DurationType;
  dots: 0 | 1 | 2 | 3;
}

export const TICKS_PER_QUARTER = 480;

const BASE_TICKS: Record<DurationType, number> = {
  whole: 1920,
  half: 960,
  quarter: 480,
  eighth: 240,
  "16th": 120,
  "32nd": 60,
  "64th": 30,
};

export function durationToTicks(d: Duration): number {
  let ticks = BASE_TICKS[d.type];
  let dotValue = ticks / 2;
  for (let i = 0; i < d.dots; i++) {
    ticks += dotValue;
    dotValue /= 2;
  }
  return ticks;
}

export function measureCapacity(numerator: number, denominator: number): number {
  const beatTicks = (TICKS_PER_QUARTER * 4) / denominator;
  return numerator * beatTicks;
}

export const DURATION_TYPES_ORDERED: DurationType[] = [
  "whole",
  "half",
  "quarter",
  "eighth",
  "16th",
  "32nd",
  "64th",
];

/**
 * Calculates total ticks used by all events in a voice.
 */
export function voiceTicksUsed(events: { duration: Duration }[]): number {
  return events.reduce((sum, e) => sum + durationToTicks(e.duration), 0);
}
