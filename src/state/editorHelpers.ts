/**
 * Shared helper functions used across EditorState action modules.
 */
import type {
  Score,
  Measure,
  PitchClass,
  Octave,
  ClefType,
} from "../model";
import type { CursorPosition } from "../input/InputState";
import type { VoiceId } from "../model/ids";
import { newId } from "../model/ids";
import { pitchToMidi } from "../model/pitch";
import { previewPitches } from "../playback/TonePlayback";

/** Default octave per clef — places notes in the middle of the staff */
export const CLEF_DEFAULT_OCTAVE: Record<ClefType, number> = {
  treble: 4,
  bass: 3,
  alto: 4,
  tenor: 3,
};

/** Preview the sound of the event at the given cursor position. */
export function previewEventAt(score: Score, cursor: CursorPosition): void {
  const part = score.parts[cursor.partIndex];
  const event = part?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex]?.events[cursor.eventIndex];
  if (!event) return;
  if ((event.kind === "note" || event.kind === "chord" || event.kind === "grace") && event.muted) return;
  let midis: number[] = [];
  if (event.kind === "note" || event.kind === "grace") {
    midis = [pitchToMidi(event.head.pitch)];
  } else if (event.kind === "chord") {
    midis = event.heads.map((h) => pitchToMidi(h.pitch));
  } else {
    return;
  }
  previewPitches(midis, part?.instrumentId);
}

/** Find the flat voice index for voice N on a given staff. Creates the voice if needed. */
export function findOrCreateVoiceForStaff(measure: Measure, staveIndex: number, localVoiceN: number): number {
  const staffVoices = measure.voices
    .map((v, i) => ({ voice: v, flatIndex: i }))
    .filter((e) => (e.voice.staff ?? 0) === staveIndex);
  if (localVoiceN < staffVoices.length) {
    return staffVoices[localVoiceN].flatIndex;
  }
  // Create voices up to the requested local index
  let flatIndex = -1;
  for (let i = staffVoices.length; i <= localVoiceN; i++) {
    flatIndex = measure.voices.length;
    measure.voices.push({
      id: newId<VoiceId>("vce"),
      events: [],
      staff: staveIndex,
    });
  }
  return flatIndex;
}

/** Smart octave: pick the octave that places the note closest to the previous note's pitch.
 *  Returns the effective octave, applying clef offset. Falls back to clef-based default. */
export function smartOctave(score: Score, cursor: CursorPosition, pitchClass: PitchClass): Octave {
  const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  // Look for the previous pitched event (in this voice, this measure, before cursor)
  let prevPitch: import("../model").Pitch | null = null;
  if (voice) {
    for (let i = cursor.eventIndex - 1; i >= 0; i--) {
      const evt = voice.events[i];
      if (!evt) continue;
      if (evt.kind === "note") { prevPitch = evt.head.pitch; break; }
      if (evt.kind === "chord" && evt.heads.length > 0) { prevPitch = evt.heads[0].pitch; break; }
      if (evt.kind === "grace") { prevPitch = evt.head.pitch; break; }
    }
  }
  // Also search previous measures in same voice
  if (!prevPitch) {
    const part = score.parts[cursor.partIndex];
    if (part) {
      for (let mi = cursor.measureIndex - 1; mi >= 0 && !prevPitch; mi--) {
        const v = part.measures[mi]?.voices[cursor.voiceIndex];
        if (!v) continue;
        for (let i = v.events.length - 1; i >= 0; i--) {
          const evt = v.events[i];
          if (!evt) continue;
          if (evt.kind === "note") { prevPitch = evt.head.pitch; break; }
          if (evt.kind === "chord" && evt.heads.length > 0) { prevPitch = evt.heads[0].pitch; break; }
          if (evt.kind === "grace") { prevPitch = evt.head.pitch; break; }
        }
      }
    }
  }
  if (!prevPitch) {
    // No previous note — use clef default
    const measure = score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
    if (!measure) return 4 as Octave;
    if ((cursor.staveIndex ?? 0) >= 1) return 3 as Octave;
    return (CLEF_DEFAULT_OCTAVE[measure.clef.type] ?? 4) as Octave;
  }

  // Find the octave for pitchClass that's closest to prevPitch
  const prevMidi = pitchToMidi(prevPitch);
  let bestOctave = 4 as Octave;
  let bestDist = Infinity;
  for (let o = 0; o <= 9; o++) {
    const midi = pitchToMidi({ pitchClass, accidental: "natural", octave: o as Octave });
    const dist = Math.abs(midi - prevMidi);
    if (dist < bestDist) {
      bestDist = dist;
      bestOctave = o as Octave;
    }
  }
  return bestOctave;
}

/** Returns true if the cursor is on an existing event (not past the end) */
export function cursorOnExistingEvent(score: Score, cursor: CursorPosition): boolean {
  const voice =
    score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  if (!voice) return false;
  return cursor.eventIndex < voice.events.length;
}

/** Resolve which chord head to act on. Returns the explicit selection when valid;
 *  otherwise, on a chord, defaults to the top (highest-pitch) head. */
export function resolveChordHead(
  score: Score,
  cursor: CursorPosition,
  selected: number | null | undefined,
): number | null {
  const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  const event = voice?.events[cursor.eventIndex];
  if (!event || event.kind !== "chord" || event.heads.length === 0) return null;
  if (selected != null && selected >= 0 && selected < event.heads.length) return selected;
  let topIdx = 0;
  let topMidi = pitchToMidi(event.heads[0].pitch);
  for (let i = 1; i < event.heads.length; i++) {
    const m = pitchToMidi(event.heads[i].pitch);
    if (m > topMidi) { topMidi = m; topIdx = i; }
  }
  return topIdx;
}
