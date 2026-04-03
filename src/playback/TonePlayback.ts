/**
 * Lookahead playback scheduler.
 * Schedules notes ~100ms ahead in a setInterval loop.
 * Reads tempo dynamically so changes take effect immediately.
 */
import * as Tone from "tone";
import type { Score } from "../model/score";
import { durationToTicks, TICKS_PER_QUARTER } from "../model/duration";
import { pitchToMidi } from "../model/pitch";
import type { TempoMark, DynamicLevel, DynamicMark, Hairpin } from "../model/annotations";
import type { Articulation } from "../model/note";

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
}

const LOOKAHEAD_SEC = 0.1;
const SCHEDULER_INTERVAL_MS = 25;

// --- State ---

let state: TransportState = "stopped";
let onTickCallback: ((tick: number) => void) | null = null;
let onStateChangeCallback: ((state: TransportState) => void) | null = null;
let metronomeEnabled = false;
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
let eventCursor = 0;
let metronomeCursor = 0;
let anchorAudioTime = 0;
let anchorTick = 0;
let currentBpm = 120;
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

function getMeasureIndexForTick(tick: number): number {
  for (let i = measureBoundaries.length - 1; i >= 0; i--) {
    if (tick >= measureBoundaries[i].tick) return measureBoundaries[i].measureIndex;
  }
  return 0;
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
  const mi = getMeasureIndexForTick(tick);
  return getTempoForMeasure(currentScore, mi);
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
    }
  }
  return { velocity, durationMultiplier };
}

function buildDynamicMap(score: Score, lastMi: number): Map<string, number>[] {
  const maps: Map<string, number>[] = [];
  for (let pi = 0; pi < score.parts.length; pi++) {
    const map = new Map<string, number>();
    let currentVel = DEFAULT_VELOCITY;
    for (let mi = 0; mi <= lastMi; mi++) {
      const m = score.parts[pi]?.measures[mi];
      if (!m) continue;
      for (const ann of m.annotations) {
        if (ann.kind !== "dynamic") continue;
        const dyn = ann as DynamicMark;
        if (dyn.level === "fp") {
          map.set(dyn.noteEventId, DYNAMIC_VELOCITY.fp);
          currentVel = DYNAMIC_VELOCITY.p;
        } else if (dyn.level === "sfz") {
          map.set(dyn.noteEventId, DYNAMIC_VELOCITY.sfz);
        } else {
          currentVel = DYNAMIC_VELOCITY[dyn.level];
          map.set(dyn.noteEventId, currentVel);
        }
      }
      for (const voice of m.voices) {
        for (const evt of voice.events) {
          if (!map.has(evt.id)) map.set(evt.id, currentVel);
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

function buildEvents(score: Score): void {
  events = [];
  metronomeBeats = [];
  measureBoundaries = [];

  const lastMi = findLastContentMeasure(score);
  let dynamicMaps: Map<string, number>[] = [];
  let hairpinMaps: Map<string, number>[] = [];
  dynamicMaps = buildDynamicMap(score, lastMi);
  hairpinMaps = buildHairpinMap(score, lastMi, dynamicMaps);
  let tick = 0;

  for (let mi = 0; mi <= lastMi; mi++) {
    const m0 = score.parts[0]?.measures[mi];
    if (!m0) continue;

    const mTicks = (TICKS_PER_QUARTER * 4 * m0.timeSignature.numerator) / m0.timeSignature.denominator;
    measureBoundaries.push({ tick, measureIndex: mi });

    for (let pi = 0; pi < score.parts.length; pi++) {
      const part = score.parts[pi];
      const m = part.measures[mi];
      if (!m) continue;
      const instId = part.instrumentId;
      const dynMap = dynamicMaps[pi];
      const hpMap = hairpinMaps[pi];
      for (const voice of m.voices) {
        let offset = 0;
        const graceBuffer: { midi: number; instrumentId: string; velocity: number }[] = [];
        for (const evt of voice.events) {
          if (evt.kind === "grace") {
            const vel = dynMap?.get(evt.id) ?? DEFAULT_VELOCITY;
            graceBuffer.push({ midi: pitchToMidi(evt.head.pitch), instrumentId: instId, velocity: vel });
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
              events.push({ tick: tick + Math.max(0, graceOffset), midi: graceBuffer[gi].midi, durationTicks: graceDur, durationMultiplier: 0.9, velocity: graceBuffer[gi].velocity, instrumentId: graceBuffer[gi].instrumentId, partIndex: pi });
            }
            graceBuffer.length = 0;
          }
          if (evt.kind === "note") {
            events.push({ tick: tick + offset, midi: pitchToMidi(evt.head.pitch), durationTicks: evtTicks, durationMultiplier: durMult, velocity: baseVel, instrumentId: instId, partIndex: pi });
          } else if (evt.kind === "chord") {
            for (const h of evt.heads) {
              events.push({ tick: tick + offset, midi: pitchToMidi(h.pitch), durationTicks: evtTicks, durationMultiplier: durMult, velocity: baseVel, instrumentId: instId, partIndex: pi });
            }
          }
          offset += evtTicks;
        }
      }
    }

    const beats = m0.timeSignature.numerator;
    const beatTicks = (TICKS_PER_QUARTER * 4) / m0.timeSignature.denominator;
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

  const lookaheadTick = currentTick + secToTicks(LOOKAHEAD_SEC, currentBpm);

  // Schedule notes (skip muted parts at play time so mute toggles take effect immediately)
  while (eventCursor < events.length && events[eventCursor].tick < lookaheadTick) {
    const e = events[eventCursor];
    if (customPlayer && e.tick >= scheduledUpToTick && !(currentScore!.parts[e.partIndex]?.muted)) {
      const audioTime = tickToAudioTime(e.tick);
      const dur = Math.max(ticksToSec(e.durationTicks, currentBpm) * e.durationMultiplier, 0.05);
      customPlayer.play(e.midi, dur, audioTime, e.instrumentId, e.velocity);
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

  if (currentTick >= totalTicks) {
    stop();
  }
}

function updateCursor(): void {
  if (state !== "playing") return;
  const elapsed = Tone.now() - anchorAudioTime;
  const currentTick = anchorTick + secToTicks(elapsed, currentBpm);
  onTickCallback?.(currentTick);
  if (currentTick < totalTicks) {
    animationFrame = requestAnimationFrame(updateCursor);
  }
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

export async function play(score: Score): Promise<void> {
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

  if (state === "paused") {
    // Resume — anchorTick already holds the paused position
    anchorAudioTime = Tone.now();
    currentBpm = getBpmAtTick(anchorTick);
    resetCursorsToTick(anchorTick);
  } else {
    anchorTick = 0;
    anchorAudioTime = Tone.now();
    currentBpm = getBpmAtTick(0);
    resetCursorsToTick(0);
  }

  schedulerInterval = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
  schedulerTick();
  animationFrame = requestAnimationFrame(updateCursor);
  setState("playing");
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
