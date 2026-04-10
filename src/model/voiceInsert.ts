/**
 * Core algorithm for insert mode: shift events forward in a voice,
 * handling measure overflow, note splitting at barlines, and annotation migration.
 */
import type { Part } from "./score";
import type { NoteEvent, NoteHead } from "./note";
import type { Annotation } from "./annotations";
import { durationToTicks, measureCapacity, voiceTicksUsed, ticksToDurations } from "./duration";
import { newId, type NoteEventId, type VoiceId } from "./ids";
import { voice as makeVoice, measure as makeMeasure } from "./factory";

/**
 * Insert an event into a voice and shift subsequent events forward.
 * Handles overflow by spilling events into subsequent measures.
 * Returns the modified part (mutated in place).
 */
export function shiftVoiceForward(
  part: Part,
  voiceIndex: number,
  measureIndex: number,
  eventIndex: number,
  newEvent: NoteEvent,
): void {
  // Insert the new event
  ensureVoice(part, measureIndex, voiceIndex);
  const voice = part.measures[measureIndex].voices[voiceIndex];
  voice.events.splice(eventIndex, 0, newEvent);

  // Cascade overflow starting from the insertion measure
  let mi = measureIndex;
  while (mi < part.measures.length) {
    const measure = part.measures[mi];
    ensureVoice(part, mi, voiceIndex);
    const v = measure.voices[voiceIndex];
    const capacity = measureCapacity(measure.timeSignature.numerator, measure.timeSignature.denominator);
    const used = voiceTicksUsed(v.events);

    if (used <= capacity) break; // no overflow

    // Find the split point: which event causes overflow
    let ticksSoFar = 0;
    let splitIdx = 0;
    for (let i = 0; i < v.events.length; i++) {
      const evt = v.events[i];
      if (evt.kind === "grace") continue; // grace notes are 0 ticks
      const evtTicks = durationToTicks(evt.duration, evt.tuplet);
      if (ticksSoFar + evtTicks > capacity) {
        splitIdx = i;
        break;
      }
      ticksSoFar += evtTicks;
      splitIdx = i + 1;
    }

    const ticksBeforeBarline = capacity - ticksSoFar;
    let spillEvents: NoteEvent[];

    if (ticksBeforeBarline > 0 && splitIdx < v.events.length) {
      // The event at splitIdx straddles the barline — split it
      const straddler = v.events[splitIdx];
      const { before, after } = splitEventAtTick(straddler, ticksBeforeBarline);

      // Replace the straddler with the before-part
      v.events.splice(splitIdx, 1, ...before);
      // Spill: the after-part + everything after the split point
      spillEvents = [...after, ...v.events.splice(splitIdx + before.length)];
    } else {
      // Clean split — events after splitIdx spill entirely
      spillEvents = v.events.splice(splitIdx);
    }

    if (spillEvents.length === 0) break;

    // Migrate annotations that reference spilled events
    const spillIds = new Set(spillEvents.map((e) => e.id));
    const migratedAnnotations: Annotation[] = [];
    measure.annotations = measure.annotations.filter((ann) => {
      const refs = getAnnotationEventIds(ann);
      if (refs.some((id) => spillIds.has(id))) {
        migratedAnnotations.push(ann);
        return false;
      }
      return true;
    });

    // Ensure next measure exists
    if (mi + 1 >= part.measures.length) {
      const newMeasure = makeMeasure(
        [makeVoice([])],
        {
          timeSignature: measure.timeSignature,
          keySignature: measure.keySignature,
          clef: measure.clef,
        },
      );
      part.measures.push(newMeasure);
    }

    // Prepend spilled events to next measure's voice
    const nextMeasure = part.measures[mi + 1];
    ensureVoice(part, mi + 1, voiceIndex);
    const nextVoice = nextMeasure.voices[voiceIndex];
    nextVoice.events.unshift(...spillEvents);
    nextMeasure.annotations.push(...migratedAnnotations);

    mi++; // check next measure for overflow
  }
}

/** Ensure a voice exists at the given index in a measure */
function ensureVoice(part: Part, measureIndex: number, voiceIndex: number): void {
  const measure = part.measures[measureIndex];
  while (measure.voices.length <= voiceIndex) {
    measure.voices.push({ id: newId<VoiceId>("vce"), events: [] });
  }
}

/**
 * Split a note event at a given tick boundary.
 * Returns before (fits in current measure) and after (spills to next).
 * Notes/chords get tied; rests just split into separate rest events.
 */
export function splitEventAtTick(
  event: NoteEvent,
  ticksBefore: number,
): { before: NoteEvent[]; after: NoteEvent[] } {
  const totalTicks = durationToTicks(event.duration, event.tuplet);
  const ticksAfter = totalTicks - ticksBefore;

  if (ticksBefore <= 0) return { before: [], after: [event] };
  if (ticksAfter <= 0) return { before: [event], after: [] };

  const beforeDurs = ticksToDurations(ticksBefore);
  const afterDurs = ticksToDurations(ticksAfter);

  if (beforeDurs.length === 0 || afterDurs.length === 0) {
    // Can't decompose — keep the event whole on whichever side is larger
    return ticksBefore >= ticksAfter
      ? { before: [event], after: [] }
      : { before: [], after: [event] };
  }

  if (event.kind === "rest" || event.kind === "slash") {
    return {
      before: beforeDurs.map((d) => ({
        ...event,
        id: newId<NoteEventId>("evt"),
        duration: d,
        tuplet: undefined,
      })),
      after: afterDurs.map((d) => ({
        ...event,
        id: newId<NoteEventId>("evt"),
        duration: d,
        tuplet: undefined,
      })),
    };
  }

  if (event.kind === "note") {
    const beforeEvents: NoteEvent[] = beforeDurs.map((d, i) => ({
      ...event,
      id: i === 0 ? event.id : newId<NoteEventId>("evt"), // first keeps original ID
      duration: d,
      tuplet: undefined,
      head: {
        ...event.head,
        tied: true, // each before-event ties to the next
      },
    }));
    const afterEvents: NoteEvent[] = afterDurs.map((d, i) => ({
      ...event,
      id: newId<NoteEventId>("evt"),
      duration: d,
      tuplet: undefined,
      head: {
        ...event.head,
        tied: i < afterDurs.length - 1 ? true : event.head.tied, // preserve original tied state on last
      },
    }));
    return { before: beforeEvents, after: afterEvents };
  }

  if (event.kind === "chord") {
    const tieHeads = (heads: NoteHead[], isTied: boolean): NoteHead[] =>
      heads.map((h) => ({ ...h, tied: isTied || undefined }));

    const beforeEvents: NoteEvent[] = beforeDurs.map((d, i) => ({
      ...event,
      id: i === 0 ? event.id : newId<NoteEventId>("evt"),
      duration: d,
      tuplet: undefined,
      heads: tieHeads(event.heads, true),
    }));
    const afterEvents: NoteEvent[] = afterDurs.map((d, i) => ({
      ...event,
      id: newId<NoteEventId>("evt"),
      duration: d,
      tuplet: undefined,
      heads: tieHeads(event.heads, i < afterDurs.length - 1),
    }));
    return { before: beforeEvents, after: afterEvents };
  }

  // Grace notes shouldn't be split
  return { before: [event], after: [] };
}

/** Get all event IDs referenced by an annotation */
function getAnnotationEventIds(ann: Annotation): NoteEventId[] {
  switch (ann.kind) {
    case "chord-symbol":
    case "lyric":
    case "dynamic":
      return [ann.noteEventId];
    case "hairpin":
    case "slur":
      return [ann.startEventId, ann.endEventId];
    case "rehearsal-mark":
    case "tempo-mark":
      return [];
  }
}
