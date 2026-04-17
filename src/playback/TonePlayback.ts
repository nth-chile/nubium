/**
 * Lookahead playback scheduler.
 * Schedules notes ~100ms ahead in a setInterval loop.
 * Reads tempo dynamically so changes take effect immediately.
 */
import * as Tone from "tone";
import type { Score } from "../model/score";
import { durationToTicks, TICKS_PER_QUARTER } from "../model/duration";
import { pitchToMidi } from "../model/pitch";
import type { TempoMark, DynamicLevel, DynamicMark, Hairpin, SwingSettings } from "../model/annotations";
import { computePlaybackOrder } from "./PlaybackOrder";
import type { Articulation } from "../model/note";
import { getInstrument } from "../model/instruments";

export type TransportState = "stopped" | "playing" | "paused";

export interface TransportOptions {
  onTick: (tick: number) => void;
  onStateChange: (state: TransportState) => void;
}

export interface NotePlayer {
  play(midi: number, duration: number, time: number, instrumentId?: string, velocity?: number): void;
  stop(): void;
  resume?(): Promise<void>;
  preloadForScore?(instrumentIds: string[]): Promise<void>;
}

interface PlayEvent {
  tick: number;
  midi: number;
  durationTicks: number;
  durationMultiplier: number;
  velocity: number; // 0-127
  instrumentId: string;
  partIndex: number;
}

// --- Dynamics ---

const DYNAMIC_VELOCITY: Record<DynamicLevel, number> = {
  pp: 40, p: 55, mp: 70, mf: 85, f: 105, ff: 120, sfz: 127, fp: 127,
};

const DEFAULT_VELOCITY = 80;

interface MetronomeBeat {
  tick: number;
  isDownbeat: boolean;
}

interface MeasureBoundary {
  tick: number;
  measureIndex: number;
  swing?: SwingSettings;
  /** Ticks per beat for swing subdivision detection */
  beatTicks: number;
}

const LOOKAHEAD_SEC = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
/** Minimum gap between onTick callbacks (ms). Throttles cursor updates to
 *  ~30fps so heavy downstream React/canvas work doesn't run 60×/sec during
 *  long playback. The rAF loop keeps running so motion still feels smooth. */
const TICK_CALLBACK_MIN_INTERVAL_MS = 33;

// --- State ---

let state: TransportState = "stopped";
let onTickCallback: ((tick: number) => void) | null = null;
let onStateChangeCallback: ((state: TransportState) => void) | null = null;
let metronomeEnabled = false;
let countInEnabled = false;
let metronomeSynth: Tone.PolySynth | null = null;
let customPlayer: NotePlayer | null = null;

let currentScore: Score | null = null;
let globalBpm = 120;
let events: PlayEvent[] = [];
let metronomeBeats: MetronomeBeat[] = [];
let measureBoundaries: MeasureBoundary[] = [];
let totalTicks = 0;

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let animationFrame: number | null = null;
let lastTickCallbackTime = 0;
let eventCursor = 0;
let metronomeCursor = 0;
let anchorAudioTime = 0;
let anchorTick = 0;
let currentBpm = 120;
let stopAtTick: number | null = null; // For play-selection: loop back at this tick
let loopStartTick: number | null = null; // For play-selection: loop back to this tick
let scheduledUpToTick = 0;

// --- Helpers ---

function setState(s: TransportState): void {
  state = s;
  onStateChangeCallback?.(s);
}

function ensureMetronomeSynth(): Tone.PolySynth {
  if (!metronomeSynth) {
    metronomeSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    }).toDestination();
    metronomeSynth.volume.value = -4;
  }
  return metronomeSynth;
}


function ticksToSec(ticks: number, bpm: number): number {
  return (ticks / TICKS_PER_QUARTER) * (60 / bpm);
}

function secToTicks(sec: number, bpm: number): number {
  return (sec * bpm * TICKS_PER_QUARTER) / 60;
}

function getTempoForMeasure(score: Score, mi: number, fallbackBpm?: number): number {
  // Search backwards from the current measure to find the most recent tempo mark
  for (let i = mi; i >= 0; i--) {
    for (const part of score.parts) {
      const m = part.measures[i];
      if (!m) continue;
      for (const ann of m.annotations) {
        if (ann.kind === "tempo-mark") return (ann as TempoMark).bpm;
      }
    }
  }
  return fallbackBpm ?? globalBpm;
}

export function getMeasureIndexForTick(tick: number): { measureIndex: number; tickInMeasure: number } {
  for (let i = measureBoundaries.length - 1; i >= 0; i--) {
    if (tick >= measureBoundaries[i].tick) {
      return { measureIndex: measureBoundaries[i].measureIndex, tickInMeasure: tick - measureBoundaries[i].tick };
    }
  }
  return { measureIndex: 0, tickInMeasure: 0 };
}

function findLastContentMeasure(score: Score): number {
  let last = 0;
  for (const part of score.parts) {
    for (let mi = part.measures.length - 1; mi >= 0; mi--) {
      if (part.measures[mi].voices.some((v) => v.events.length > 0)) {
        last = Math.max(last, mi);
        break;
      }
    }
  }
  return last;
}

function getBpmAtTick(tick: number): number {
  if (!currentScore) return globalBpm;
  const { measureIndex } = getMeasureIndexForTick(tick);
  return getTempoForMeasure(currentScore, measureIndex);
}

// --- Dynamics & Articulations ---

function applyArticulations(
  articulations: Articulation[] | undefined,
  velocity: number,
  durationMultiplier: number
): { velocity: number; durationMultiplier: number } {
  if (!articulations?.length) return { velocity, durationMultiplier };
  for (const art of articulations) {
    switch (art.kind) {
      case "staccato": durationMultiplier *= 0.5; break;
      case "staccatissimo": durationMultiplier *= 0.3; break;
      case "accent": case "marcato": velocity = Math.min(127, velocity * 1.3); break;
      case "tenuto": durationMultiplier = 1.0; break;
      case "fermata": durationMultiplier *= 1.5; break;
      case "ghost-note": velocity = Math.max(20, velocity * 0.5); break;
      case "palm-mute": durationMultiplier *= 0.4; break;
      case "dead-note": velocity = Math.max(20, velocity * 0.3); durationMultiplier *= 0.15; break;
      case "hammer-on": case "pull-off": velocity = Math.max(30, velocity * 0.7); break;
    }
  }
  return { velocity, durationMultiplier };
}

function buildDynamicMap(score: Score, lastMi: number): Map<string, number>[] {
  const maps: Map<string, number>[] = [];
  for (let pi = 0; pi < score.parts.length; pi++) {
    const map = new Map<string, number>();
    let currentVel = DEFAULT_VELOCITY;
    // Index dynamics by noteEventId for quick lookup
    const dynByEvent = new Map<string, DynamicMark>();
    for (let mi = 0; mi <= lastMi; mi++) {
      const m = score.parts[pi]?.measures[mi];
      if (!m) continue;
      for (const ann of m.annotations) {
        if (ann.kind === "dynamic") dynByEvent.set((ann as DynamicMark).noteEventId, ann as DynamicMark);
      }
    }
    // Walk events in order, applying dynamics as they're encountered
    for (let mi = 0; mi <= lastMi; mi++) {
      const m = score.parts[pi]?.measures[mi];
      if (!m) continue;
      for (const voice of m.voices) {
        for (const evt of voice.events) {
          const dyn = dynByEvent.get(evt.id);
          if (dyn) {
            if (dyn.level === "fp") {
              map.set(evt.id, DYNAMIC_VELOCITY.fp);
              currentVel = DYNAMIC_VELOCITY.p;
            } else if (dyn.level === "sfz") {
              map.set(evt.id, DYNAMIC_VELOCITY.sfz);
              // currentVel unchanged — sfz is a one-note accent
            } else {
              currentVel = DYNAMIC_VELOCITY[dyn.level];
              map.set(evt.id, currentVel);
            }
          } else {
            map.set(evt.id, currentVel);
          }
        }
      }
    }
    maps.push(map);
  }
  return maps;
}

function buildHairpinMap(score: Score, lastMi: number, dynamicMaps: Map<string, number>[]): Map<string, number>[] {
  const maps: Map<string, number>[] = [];
  for (let pi = 0; pi < score.parts.length; pi++) {
    const map = new Map<string, number>();
    const dynMap = dynamicMaps[pi];
    for (let mi = 0; mi <= lastMi; mi++) {
      const m = score.parts[pi]?.measures[mi];
      if (!m) continue;
      for (const ann of m.annotations) {
        if (ann.kind !== "hairpin") continue;
        const hp = ann as Hairpin;
        const startVel = dynMap.get(hp.startEventId) ?? DEFAULT_VELOCITY;
        const endVel = hp.type === "crescendo" ? Math.min(127, startVel + 30) : Math.max(20, startVel - 30);
        // Find dynamic at end if it exists
        const endDyn = dynMap.get(hp.endEventId);
        const targetVel = (endDyn !== undefined && endDyn !== startVel) ? endDyn : endVel;
        const eventIds = collectEventIdsBetween(score, pi, mi, lastMi, hp.startEventId, hp.endEventId);
        if (eventIds.length <= 1) continue;
        for (let i = 0; i < eventIds.length; i++) {
          const t = i / (eventIds.length - 1);
          map.set(eventIds[i], Math.max(1, Math.min(127, Math.round(startVel + (targetVel - startVel) * t))));
        }
      }
    }
    maps.push(map);
  }
  return maps;
}

function collectEventIdsBetween(score: Score, pi: number, startMi: number, lastMi: number, startId: string, endId: string): string[] {
  const ids: string[] = [];
  let collecting = false;
  for (let mi = startMi; mi <= lastMi; mi++) {
    const m = score.parts[pi]?.measures[mi];
    if (!m) continue;
    for (const voice of m.voices) {
      for (const evt of voice.events) {
        if (evt.id === startId) collecting = true;
        if (collecting && (evt.kind === "note" || evt.kind === "chord")) ids.push(evt.id);
        if (evt.id === endId) return ids;
      }
    }
  }
  return ids;
}

// --- Build phase ---

/**
 * Emit or extend a play event for a single pitch, honoring ties.
 * If a prior tied event on the same (part, voice, pitch) is pending, its
 * duration is extended by evtTicks; otherwise a new event is emitted.
 * The pending-tie map is updated based on whether this head is itself tied.
 */
function emitOrExtendPitch(
  midi: number,
  evtTicks: number,
  durMult: number,
  velocity: number,
  tick: number,
  offset: number,
  instId: string,
  pi: number,
  vi: number,
  isTied: boolean,
  muted: boolean,
  pendingTies: Map<string, PlayEvent>,
): void {
  const key = `${pi}:${vi}:${midi}`;
  const pending = pendingTies.get(key);
  if (pending) {
    pending.durationTicks += evtTicks;
    if (!isTied) pendingTies.delete(key);
    return;
  }
  if (muted) return;
  const newEvent: PlayEvent = {
    tick: tick + offset, midi, durationTicks: evtTicks,
    durationMultiplier: durMult, velocity, instrumentId: instId, partIndex: pi,
  };
  events.push(newEvent);
  if (isTied) pendingTies.set(key, newEvent);
}

/** Remove all pending ties for a given (part, voice) — used when a tie is broken by rest/slash/etc. */
function clearPendingTiesForVoice(pendingTies: Map<string, PlayEvent>, pi: number, vi: number): void {
  const prefix = `${pi}:${vi}:`;
  for (const k of Array.from(pendingTies.keys())) {
    if (k.startsWith(prefix)) pendingTies.delete(k);
  }
}

/** Remove pending ties for a voice whose pitch is NOT in the given set (tie not continued by next note). */
function clearPendingTiesNotIn(pendingTies: Map<string, PlayEvent>, pi: number, vi: number, keep: Set<number>): void {
  const prefix = `${pi}:${vi}:`;
  for (const k of Array.from(pendingTies.keys())) {
    if (!k.startsWith(prefix)) continue;
    const midi = Number(k.slice(prefix.length));
    if (!keep.has(midi)) pendingTies.delete(k);
  }
}

/**
 * Process a single measure's voices into play events, honoring ties across
 * events and measures via pendingTies.
 */
function processMeasureVoices(
  score: Score,
  mi: number,
  baseTick: number,
  dynamicMaps: Map<string, number>[],
  hairpinMaps: Map<string, number>[],
  pendingTies: Map<string, PlayEvent>,
): void {
  for (let pi = 0; pi < score.parts.length; pi++) {
    const part = score.parts[pi];
    const m = part.measures[mi];
    if (!m) continue;
    const instId = part.instrumentId;
    const transposition = getInstrument(instId)?.transposition ?? 0;
    const dynMap = dynamicMaps[pi];
    const hpMap = hairpinMaps[pi];
    for (let vi = 0; vi < m.voices.length; vi++) {
      const voice = m.voices[vi];
      let offset = 0;
      const graceBuffer: { midi: number; instrumentId: string; velocity: number }[] = [];
      for (const evt of voice.events) {
        if (evt.kind === "grace") {
          if (!evt.muted) {
            const vel = dynMap?.get(evt.id) ?? DEFAULT_VELOCITY;
            graceBuffer.push({ midi: pitchToMidi(evt.head.pitch) + transposition, instrumentId: instId, velocity: vel });
          }
          continue;
        }
        const evtTicks = durationToTicks(evt.duration);

        // Resolve velocity and articulations
        let baseVel = hpMap?.get(evt.id) ?? dynMap?.get(evt.id) ?? DEFAULT_VELOCITY;
        let durMult = 0.9;
        if ((evt.kind === "note" || evt.kind === "chord") && evt.articulations?.length) {
          const result = applyArticulations(evt.articulations, baseVel, durMult);
          baseVel = result.velocity;
          durMult = result.durationMultiplier;
        }

        // Play buffered grace notes just before this event
        if (graceBuffer.length > 0) {
          const graceDur = Math.min(60, evtTicks / (graceBuffer.length + 1));
          for (let gi = 0; gi < graceBuffer.length; gi++) {
            const graceOffset = offset - graceDur * (graceBuffer.length - gi);
            events.push({ tick: baseTick + Math.max(0, graceOffset), midi: graceBuffer[gi].midi, durationTicks: graceDur, durationMultiplier: 0.9, velocity: graceBuffer[gi].velocity, instrumentId: graceBuffer[gi].instrumentId, partIndex: pi });
          }
          graceBuffer.length = 0;
        }

        if (evt.kind === "note") {
          const midi = pitchToMidi(evt.head.pitch) + transposition;
          const tied = evt.head.tied === true;
          emitOrExtendPitch(midi, evtTicks, durMult, baseVel, baseTick, offset, instId, pi, vi, tied, !!evt.muted, pendingTies);
          clearPendingTiesNotIn(pendingTies, pi, vi, new Set([midi]));
        } else if (evt.kind === "chord") {
          const chordMidis = new Set<number>();
          for (const h of evt.heads) {
            const midi = pitchToMidi(h.pitch) + transposition;
            chordMidis.add(midi);
            const tied = h.tied === true;
            emitOrExtendPitch(midi, evtTicks, durMult, baseVel, baseTick, offset, instId, pi, vi, tied, !!evt.muted, pendingTies);
          }
          clearPendingTiesNotIn(pendingTies, pi, vi, chordMidis);
        } else {
          // rest, slash — break any pending ties for this voice
          clearPendingTiesForVoice(pendingTies, pi, vi);
        }
        offset += evtTicks;
      }
    }
  }
}

function buildEvents(score: Score): void {
  events = [];
  metronomeBeats = [];
  measureBoundaries = [];

  const lastMi = findLastContentMeasure(score);
  const dynamicMaps = buildDynamicMap(score, lastMi);
  const hairpinMaps = buildHairpinMap(score, lastMi, dynamicMaps);
  const pendingTies = new Map<string, PlayEvent>();
  let tick = 0;

  // Use playback order to follow repeats, D.S., D.C., voltas, etc.
  const measureOrder = computePlaybackOrder(score, 0);
  let currentSwing: SwingSettings | undefined;

  for (const mi of measureOrder) {
    const m0 = score.parts[0]?.measures[mi];
    if (!m0) continue;

    // Check for swing changes on tempo marks in this measure
    for (const ann of m0.annotations) {
      if (ann.kind === "tempo-mark") {
        const tm = ann as TempoMark;
        if (tm.swing) currentSwing = tm.swing;
      }
    }

    const mTicks = (TICKS_PER_QUARTER * 4 * m0.timeSignature.numerator) / m0.timeSignature.denominator;
    const beatTicks = (TICKS_PER_QUARTER * 4) / m0.timeSignature.denominator;
    measureBoundaries.push({ tick, measureIndex: mi, swing: currentSwing, beatTicks });

    processMeasureVoices(score, mi, tick, dynamicMaps, hairpinMaps, pendingTies);

    const beats = m0.timeSignature.numerator;
    for (let b = 0; b < beats; b++) {
      metronomeBeats.push({ tick: tick + b * beatTicks, isDownbeat: b === 0 });
    }

    tick += mTicks;
  }

  events.sort((a, b) => a.tick - b.tick);
  totalTicks = tick;
}

/** Build events for a specific measure range (sequential, no repeats). Used for selection playback. */
function buildEventsForRange(score: Score, startMeasure: number, endMeasure: number): void {
  events = [];
  metronomeBeats = [];
  measureBoundaries = [];

  const lastMi = findLastContentMeasure(score);
  const dynamicMaps = buildDynamicMap(score, lastMi);
  const hairpinMaps = buildHairpinMap(score, lastMi, dynamicMaps);
  const pendingTies = new Map<string, PlayEvent>();
  let tick = 0;
  let currentSwing: SwingSettings | undefined;

  for (let mi = startMeasure; mi <= endMeasure; mi++) {
    const m0 = score.parts[0]?.measures[mi];
    if (!m0) continue;

    for (const ann of m0.annotations) {
      if (ann.kind === "tempo-mark") {
        currentSwing = (ann as TempoMark).swing;
      }
    }

    const mTicks = (TICKS_PER_QUARTER * 4 * m0.timeSignature.numerator) / m0.timeSignature.denominator;
    const beatTicks = (TICKS_PER_QUARTER * 4) / m0.timeSignature.denominator;
    measureBoundaries.push({ tick, measureIndex: mi, swing: currentSwing, beatTicks });

    processMeasureVoices(score, mi, tick, dynamicMaps, hairpinMaps, pendingTies);

    const beats = m0.timeSignature.numerator;
    for (let b = 0; b < beats; b++) {
      metronomeBeats.push({ tick: tick + b * beatTicks, isDownbeat: b === 0 });
    }

    tick += mTicks;
  }

  events.sort((a, b) => a.tick - b.tick);
  totalTicks = tick;
}

// --- Scheduler ---

function tickToAudioTime(tick: number): number {
  return anchorAudioTime + ticksToSec(tick - anchorTick, currentBpm);
}

/**
 * Calculate swing offset for a tick position within a measure.
 * Swing delays offbeat subdivisions within each beat.
 * For triplet swing (ratio=2): offbeat eighths shift from 50% to 66% of the beat.
 */
export function calculateSwingTick(
  tickInMeasure: number,
  swing: SwingSettings,
  beatTicks: number,
): number {
  if (swing.style === "straight") return tickInMeasure;

  const ratio = swing.ratio ?? 2;
  const subdivision = swing.subdivision ?? "eighth";
  // Swing unit: half a beat for eighths, quarter beat for sixteenths
  const swingUnit = subdivision === "sixteenth" ? beatTicks / 4 : beatTicks / 2;
  const pairTicks = swingUnit * 2;

  const posInPair = tickInMeasure % pairTicks;

  // Only offset notes on the second half of a swing pair (the offbeat)
  if (posInPair < swingUnit) return tickInMeasure;

  const offbeatOffset = posInPair - swingUnit;
  // New offbeat start: ratio/(ratio+1) of the pair
  const swungOffbeatStart = pairTicks * ratio / (ratio + 1);
  const swungOffbeatLength = pairTicks - swungOffbeatStart;
  // Scale the position proportionally within the offbeat
  const scaledOffset = (offbeatOffset / swingUnit) * swungOffbeatLength;

  const pairStart = tickInMeasure - posInPair;
  return pairStart + swungOffbeatStart + scaledOffset;
}

function applySwing(tick: number): number {
  const boundary = getMeasureBoundary(tick);
  if (!boundary?.swing || boundary.swing.style === "straight") return tick;
  const tickInMeasure = tick - boundary.tick;
  const swungTick = calculateSwingTick(tickInMeasure, boundary.swing, boundary.beatTicks);
  return boundary.tick + swungTick;
}

function getMeasureBoundary(tick: number): MeasureBoundary | undefined {
  for (let i = measureBoundaries.length - 1; i >= 0; i--) {
    if (tick >= measureBoundaries[i].tick) return measureBoundaries[i];
  }
  return measureBoundaries[0];
}

/** Boost velocity on beats 2 and 4 for shuffle feel. */
function applyBackbeatAccent(tick: number, velocity: number): number {
  const boundary = getMeasureBoundary(tick);
  if (!boundary?.swing?.backbeatAccent) return velocity;
  const tickInMeasure = tick - boundary.tick;
  const beatIndex = Math.floor(tickInMeasure / boundary.beatTicks);
  // Beats 2 and 4 (0-indexed: 1 and 3)
  if (beatIndex % 2 === 1) {
    return Math.min(127, velocity + boundary.swing.backbeatAccent);
  }
  return velocity;
}

function schedulerTick(): void {
  if (state !== "playing" || !currentScore) return;

  const now = Tone.now();
  const elapsed = now - anchorAudioTime;
  const currentTick = anchorTick + secToTicks(elapsed, currentBpm);

  // Re-anchor if tempo changed (measure boundary or global BPM change)
  const newBpm = getBpmAtTick(currentTick);
  if (newBpm !== currentBpm) {
    anchorTick = currentTick;
    anchorAudioTime = now;
    currentBpm = newBpm;
  }

  const endAt = stopAtTick ?? totalTicks;
  const lookaheadTick = Math.min(currentTick + secToTicks(LOOKAHEAD_SEC, currentBpm), endAt);

  // Schedule notes (skip muted/non-soloed parts at play time so toggles take effect immediately)
  const anySolo = currentScore!.parts.some((p) => p.solo);
  while (eventCursor < events.length && events[eventCursor].tick < lookaheadTick) {
    const e = events[eventCursor];
    const part = currentScore!.parts[e.partIndex];
    const shouldPlay = part && !part.muted && (!anySolo || part.solo);
    if (customPlayer && e.tick >= scheduledUpToTick && shouldPlay) {
      const swungTick = applySwing(e.tick);
      const audioTime = tickToAudioTime(swungTick);
      const dur = Math.max(ticksToSec(e.durationTicks, currentBpm) * e.durationMultiplier, 0.05);
      const vel = applyBackbeatAccent(e.tick, e.velocity);
      customPlayer.play(e.midi, dur, audioTime, e.instrumentId, vel);
    }
    eventCursor++;
  }

  // Schedule metronome
  if (metronomeEnabled) {
    const met = ensureMetronomeSynth();
    while (metronomeCursor < metronomeBeats.length && metronomeBeats[metronomeCursor].tick < lookaheadTick) {
      const beat = metronomeBeats[metronomeCursor];
      if (beat.tick >= scheduledUpToTick) {
        const audioTime = tickToAudioTime(beat.tick);
        const note = beat.isDownbeat ? "G6" : "C6";
        const vel = beat.isDownbeat ? 0.7 : 0.4;
        met.triggerAttackRelease(note, 0.03, audioTime, vel);
      }
      metronomeCursor++;
    }
  }

  scheduledUpToTick = lookaheadTick;

  if (currentTick >= endAt) {
    if (loopStartTick != null) {
      // Loop back to selection start
      anchorTick = loopStartTick;
      anchorAudioTime = Tone.now();
      currentBpm = getBpmAtTick(loopStartTick);
      resetCursorsToTick(loopStartTick);
      scheduledUpToTick = loopStartTick;
    } else {
      stop();
    }
  }
}

function updateCursor(): void {
  if (state !== "playing") return;
  const elapsed = Tone.now() - anchorAudioTime;
  const currentTick = anchorTick + secToTicks(elapsed, currentBpm);
  const endAt = stopAtTick ?? totalTicks;
  // Throttle onTick to ~30fps: heavy downstream work (canvas re-render + cascading
  // Zustand updates) would otherwise run 60×/sec, building GC pressure on long loops.
  const now = performance.now();
  if (now - lastTickCallbackTime >= TICK_CALLBACK_MIN_INTERVAL_MS) {
    lastTickCallbackTime = now;
    onTickCallback?.(Math.min(currentTick, endAt));
  }
  // Keep animation running — loop resets anchor in schedulerTick
  animationFrame = requestAnimationFrame(updateCursor);
}

/** Test-only: returns the throttle interval so tests can assert behavior. */
export function _getTickThrottleMs(): number {
  return TICK_CALLBACK_MIN_INTERVAL_MS;
}

/** Test-only: resets throttle state between tests. */
export function _resetTickThrottle(): void {
  lastTickCallbackTime = 0;
}

function resetCursorsToTick(tick: number): void {
  eventCursor = events.findIndex((e) => e.tick >= tick);
  if (eventCursor === -1) eventCursor = events.length;
  metronomeCursor = metronomeBeats.findIndex((b) => b.tick >= tick);
  if (metronomeCursor === -1) metronomeCursor = metronomeBeats.length;
  scheduledUpToTick = tick;
}

// --- Public API ---

export function setCallbacks(opts: TransportOptions): void {
  onTickCallback = opts.onTick;
  onStateChangeCallback = opts.onStateChange;
}

export async function play(score: Score, startTick = 0, measureRange?: { start: number; end: number }): Promise<void> {
  if (state === "playing") return;
  await Tone.start();

  // Resume custom player's AudioContext and preload instruments
  if (customPlayer) {
    await customPlayer.resume?.();
    const instrumentIds = score.parts.map((p) => p.instrumentId);
    await customPlayer.preloadForScore?.(instrumentIds.length > 0 ? instrumentIds : [""]);
  }

  currentScore = score;
  globalBpm = score.tempo;
  buildEvents(score);

  if (events.length === 0 && metronomeBeats.length === 0) return;

  // For selection playback, rebuild events for just the selected measures sequentially
  if (measureRange) {
    buildEventsForRange(score, measureRange.start, measureRange.end);
    startTick = 0;
    stopAtTick = totalTicks;
    loopStartTick = 0;
  } else {
    stopAtTick = null;
    loopStartTick = null;
  }

  // Count-in: schedule one measure of metronome clicks before playback starts
  if (countInEnabled) {
    const firstMeasure = currentScore.parts[0]?.measures[0];
    const ts = firstMeasure?.timeSignature ?? { numerator: 4, denominator: 4 };
    const beats = ts.numerator;
    const beatTicks = (TICKS_PER_QUARTER * 4) / ts.denominator;
    const countInTicks = beats * beatTicks;
    const countInBpm = getBpmAtTick(startTick);
    const met = ensureMetronomeSynth();
    const now = Tone.now();

    for (let b = 0; b < beats; b++) {
      const beatTime = now + ticksToSec(b * beatTicks, countInBpm);
      const note = b === 0 ? "G6" : "C6";
      const vel = b === 0 ? 0.7 : 0.4;
      met.triggerAttackRelease(note, 0.03, beatTime, vel);
    }

    // Delay actual playback start by the count-in duration
    const countInSec = ticksToSec(countInTicks, countInBpm);
    anchorTick = startTick;
    anchorAudioTime = now + countInSec;
    currentBpm = getBpmAtTick(startTick);
    lastTickCallbackTime = 0;
    resetCursorsToTick(startTick);

    // Start scheduler after count-in finishes
    setTimeout(() => {
      if (state !== "playing") return;
      schedulerInterval = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
      schedulerTick();
      animationFrame = requestAnimationFrame(updateCursor);
    }, countInSec * 1000);

    setState("playing");
  } else {
    // Start from resolved position
    anchorTick = startTick;
    anchorAudioTime = Tone.now();
    currentBpm = getBpmAtTick(startTick);
    lastTickCallbackTime = 0;
    resetCursorsToTick(startTick);

    schedulerInterval = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
    schedulerTick();
    animationFrame = requestAnimationFrame(updateCursor);
    setState("playing");
  }
}

export function pause(): void {
  if (state !== "playing") return;

  // Save current tick position
  const elapsed = Tone.now() - anchorAudioTime;
  anchorTick = anchorTick + secToTicks(elapsed, currentBpm);

  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  metronomeSynth?.releaseAll();
  setState("paused");
}

export function stop(): void {
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  if (customPlayer) {
    customPlayer.stop();
  }
  if (metronomeSynth) {
    metronomeSynth.dispose();
    metronomeSynth = null;
  }

  currentScore = null;
  anchorTick = 0;
  stopAtTick = null;
  loopStartTick = null;
  onTickCallback?.(0);
  setState("stopped");
}

export function setTempo(bpm: number): void {
  if (state === "playing") {
    // Re-anchor at current position so new tempo takes effect seamlessly
    const now = Tone.now();
    anchorTick = anchorTick + secToTicks(now - anchorAudioTime, currentBpm);
    anchorAudioTime = now;
  }
  globalBpm = bpm;
  if (state === "playing") {
    currentBpm = getBpmAtTick(anchorTick);
  }
}

export function updateScore(score: Score): void {
  currentScore = score;
}

export function setMetronome(enabled: boolean): void {
  metronomeEnabled = enabled;
  if (!enabled && metronomeSynth) {
    metronomeSynth.releaseAll();
  }
}

export function isMetronomeEnabled(): boolean {
  return metronomeEnabled;
}

export function setCountIn(enabled: boolean): void {
  countInEnabled = enabled;
}

export function isCountInEnabled(): boolean {
  return countInEnabled;
}

export function getTransportState(): TransportState {
  return state;
}

export function getScoreDuration(score: Score): number {
  const lastMi = findLastContentMeasure(score);
  let time = 0;
  for (let mi = 0; mi <= lastMi; mi++) {
    const m0 = score.parts[0]?.measures[mi];
    if (!m0) continue;
    const bpm = getTempoForMeasure(score, mi, score.tempo);
    const mTicks = (TICKS_PER_QUARTER * 4 * m0.timeSignature.numerator) / m0.timeSignature.denominator;
    time += ticksToSec(mTicks, bpm);
  }
  return time;
}

export function setNotePlayer(player: NotePlayer | null): void {
  customPlayer = player;
}

export function previewPitches(midis: number[], instrumentId?: string): void {
  if (!customPlayer || midis.length === 0) return;
  customPlayer.resume?.();
  const now = Tone.now();
  const transposition = instrumentId ? (getInstrument(instrumentId)?.transposition ?? 0) : 0;
  for (const midi of midis) {
    customPlayer.play(midi + transposition, 0.5, now, instrumentId, 90);
  }
}

/** Test-only: build playback events and return them for assertions. */
export function _buildEventsForTest(score: Score): Array<{
  tick: number; midi: number; durationTicks: number; velocity: number; partIndex: number;
}> {
  buildEvents(score);
  return events.map((e) => ({
    tick: e.tick, midi: e.midi, durationTicks: e.durationTicks, velocity: e.velocity, partIndex: e.partIndex,
  }));
}
