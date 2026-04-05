/**
 * Audio export: renders a score to WAV using smplr's offline rendering.
 * Replicates TonePlayback's scheduling into an OfflineAudioContext.
 */
import { Soundfont } from "smplr";
import type { Score } from "../model/score";
import { durationToTicks, TICKS_PER_QUARTER } from "../model/duration";
import { pitchToMidi } from "../model/pitch";
import type { TempoMark, DynamicLevel, DynamicMark, Hairpin, SwingSettings } from "../model/annotations";
import { computePlaybackOrder } from "../playback/PlaybackOrder";
import type { Articulation } from "../model/note";

// --- Duplicated from TonePlayback (kept in sync) ---

const DYNAMIC_VELOCITY: Record<DynamicLevel, number> = {
  pp: 40, p: 55, mp: 70, mf: 85, f: 105, ff: 120, sfz: 127, fp: 127,
};
const DEFAULT_VELOCITY = 80;

interface PlayEvent {
  tick: number;
  midi: number;
  durationTicks: number;
  durationMultiplier: number;
  velocity: number;
  instrumentId: string;
}

interface MeasureBoundary {
  tick: number;
  swing?: SwingSettings;
  beatTicks: number;
}

const GM_INSTRUMENTS: Record<string, string> = {
  piano: "acoustic_grand_piano",
  "acoustic-piano": "acoustic_grand_piano",
  "electric-piano": "electric_piano_1",
  harpsichord: "harpsichord",
  organ: "church_organ",
  guitar: "acoustic_guitar_nylon",
  "electric-guitar": "electric_guitar_clean",
  "acoustic-guitar": "acoustic_guitar_nylon",
  bass: "acoustic_bass",
  "electric-bass": "electric_bass_finger",
  violin: "violin",
  viola: "viola",
  cello: "cello",
  contrabass: "contrabass",
  strings: "string_ensemble_1",
  trumpet: "trumpet",
  trombone: "trombone",
  "french-horn": "french_horn",
  tuba: "tuba",
  saxophone: "alto_sax",
  "alto-sax": "alto_sax",
  "tenor-sax": "tenor_sax",
  clarinet: "clarinet",
  flute: "flute",
  oboe: "oboe",
  bassoon: "bassoon",
  drums: "steel_drums",
  percussion: "steel_drums",
  voice: "choir_aahs",
  choir: "choir_aahs",
  synth: "synth_strings_1",
  "": "acoustic_grand_piano",
};

function resolveInstrument(instrumentId: string): string {
  const lower = instrumentId.toLowerCase().replace(/\s+/g, "-");
  return GM_INSTRUMENTS[lower] ?? GM_INSTRUMENTS["piano"];
}

function ticksToSec(ticks: number, bpm: number): number {
  return (ticks / TICKS_PER_QUARTER) * (60 / bpm);
}

function getTempoForMeasure(score: Score, mi: number): number {
  for (let i = mi; i >= 0; i--) {
    for (const part of score.parts) {
      const m = part.measures[i];
      if (!m) continue;
      for (const ann of m.annotations) {
        if (ann.kind === "tempo-mark") return (ann as TempoMark).bpm;
      }
    }
  }
  return score.tempo;
}

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

function calculateSwingTick(tickInMeasure: number, swing: SwingSettings, beatTicks: number): number {
  if (swing.style === "straight") return tickInMeasure;
  const ratio = swing.ratio ?? 2;
  const subdivision = swing.subdivision ?? "eighth";
  const swingUnit = subdivision === "sixteenth" ? beatTicks / 4 : beatTicks / 2;
  const pairTicks = swingUnit * 2;
  const posInPair = tickInMeasure % pairTicks;
  if (posInPair < swingUnit) return tickInMeasure;
  const offbeatOffset = posInPair - swingUnit;
  const swungOffbeatStart = pairTicks * ratio / (ratio + 1);
  const swungOffbeatLength = pairTicks - swungOffbeatStart;
  const scaledOffset = (offbeatOffset / swingUnit) * swungOffbeatLength;
  const pairStart = tickInMeasure - posInPair;
  return pairStart + swungOffbeatStart + scaledOffset;
}

// --- Build events (mirrors TonePlayback.buildEvents) ---

function buildEvents(score: Score): { events: PlayEvent[]; boundaries: MeasureBoundary[]; totalTicks: number } {
  const events: PlayEvent[] = [];
  const boundaries: MeasureBoundary[] = [];

  const lastMi = findLastContentMeasure(score);
  const dynamicMaps = buildDynamicMap(score, lastMi);
  const hairpinMaps = buildHairpinMap(score, lastMi, dynamicMaps);
  let tick = 0;

  const measureOrder = computePlaybackOrder(score, 0);
  let currentSwing: SwingSettings | undefined;

  for (const mi of measureOrder) {
    const m0 = score.parts[0]?.measures[mi];
    if (!m0) continue;

    for (const ann of m0.annotations) {
      if (ann.kind === "tempo-mark") {
        const tm = ann as TempoMark;
        if (tm.swing) currentSwing = tm.swing;
      }
    }

    const mTicks = (TICKS_PER_QUARTER * 4 * m0.timeSignature.numerator) / m0.timeSignature.denominator;
    const beatTicks = (TICKS_PER_QUARTER * 4) / m0.timeSignature.denominator;
    boundaries.push({ tick, swing: currentSwing, beatTicks });

    for (let pi = 0; pi < score.parts.length; pi++) {
      const part = score.parts[pi];
      const m = part.measures[mi];
      if (!m || part.muted) continue;
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
          let baseVel = hpMap?.get(evt.id) ?? dynMap?.get(evt.id) ?? DEFAULT_VELOCITY;
          let durMult = 0.9;
          if ((evt.kind === "note" || evt.kind === "chord") && evt.articulations?.length) {
            const result = applyArticulations(evt.articulations, baseVel, durMult);
            baseVel = result.velocity;
            durMult = result.durationMultiplier;
          }
          if (graceBuffer.length > 0) {
            const graceDur = Math.min(60, evtTicks / (graceBuffer.length + 1));
            for (let gi = 0; gi < graceBuffer.length; gi++) {
              const graceOffset = offset - graceDur * (graceBuffer.length - gi);
              events.push({ tick: tick + Math.max(0, graceOffset), midi: graceBuffer[gi].midi, durationTicks: graceDur, durationMultiplier: 0.9, velocity: graceBuffer[gi].velocity, instrumentId: graceBuffer[gi].instrumentId });
            }
            graceBuffer.length = 0;
          }
          if (evt.kind === "note") {
            events.push({ tick: tick + offset, midi: pitchToMidi(evt.head.pitch), durationTicks: evtTicks, durationMultiplier: durMult, velocity: baseVel, instrumentId: instId });
          } else if (evt.kind === "chord") {
            for (const h of evt.heads) {
              events.push({ tick: tick + offset, midi: pitchToMidi(h.pitch), durationTicks: evtTicks, durationMultiplier: durMult, velocity: baseVel, instrumentId: instId });
            }
          }
          offset += evtTicks;
        }
      }
    }
    tick += mTicks;
  }

  events.sort((a, b) => a.tick - b.tick);
  return { events, boundaries, totalTicks: tick };
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

function buildDynamicMap(score: Score, lastMi: number): Map<string, number>[] {
  const maps: Map<string, number>[] = [];
  for (let pi = 0; pi < score.parts.length; pi++) {
    const map = new Map<string, number>();
    let currentVel = DEFAULT_VELOCITY;
    const dynByEvent = new Map<string, DynamicMark>();
    for (let mi = 0; mi <= lastMi; mi++) {
      const m = score.parts[pi]?.measures[mi];
      if (!m) continue;
      for (const ann of m.annotations) {
        if (ann.kind === "dynamic") dynByEvent.set((ann as DynamicMark).noteEventId, ann as DynamicMark);
      }
    }
    for (let mi = 0; mi <= lastMi; mi++) {
      const m = score.parts[pi]?.measures[mi];
      if (!m) continue;
      for (const voice of m.voices) {
        for (const evt of voice.events) {
          const dyn = dynByEvent.get(evt.id);
          if (dyn) {
            if (dyn.level === "fp") { map.set(evt.id, DYNAMIC_VELOCITY.fp); currentVel = DYNAMIC_VELOCITY.p; }
            else if (dyn.level === "sfz") { map.set(evt.id, DYNAMIC_VELOCITY.sfz); }
            else { currentVel = DYNAMIC_VELOCITY[dyn.level]; map.set(evt.id, currentVel); }
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

// --- Convert tick to seconds, accounting for tempo changes ---

function tickToSeconds(tick: number, score: Score, measureOrder: number[]): number {
  let sec = 0;
  let currentTick = 0;

  for (const mi of measureOrder) {
    const m0 = score.parts[0]?.measures[mi];
    if (!m0) continue;
    const bpm = getTempoForMeasure(score, mi);
    const mTicks = (TICKS_PER_QUARTER * 4 * m0.timeSignature.numerator) / m0.timeSignature.denominator;

    if (currentTick + mTicks > tick) {
      // Target tick is within this measure
      sec += ticksToSec(tick - currentTick, bpm);
      return sec;
    }
    sec += ticksToSec(mTicks, bpm);
    currentTick += mTicks;
  }
  return sec;
}

// --- Public API ---

export interface AudioExportProgress {
  phase: "loading" | "rendering" | "encoding";
  percent: number;
}

export async function exportToWav(
  score: Score,
  onProgress?: (p: AudioExportProgress) => void,
): Promise<Blob> {
  onProgress?.({ phase: "loading", percent: 0 });

  const { events, boundaries, totalTicks } = buildEvents(score);
  const measureOrder = computePlaybackOrder(score, 0);

  // Calculate total duration in seconds
  const totalDuration = tickToSeconds(totalTicks, score, measureOrder) + 2; // +2s for reverb tail

  onProgress?.({ phase: "rendering", percent: 0 });

  // Create OfflineAudioContext manually — smplr's scheduler uses setInterval
  // which doesn't fire during offline rendering. We proxy currentTime to return
  // a large value during scheduling so all events dispatch immediately.
  const sampleRate = 44100;
  const length = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);

  // Proxy that reports a far-future currentTime during scheduling phase.
  // This makes smplr's Scheduler dispatch all events synchronously (they all
  // fall within the lookahead window). We must bind native methods to `target`
  // because Web Audio API methods/getters fail when `this` is a Proxy.
  let fakeTime = true;
  const proxiedCtx = new Proxy(offlineCtx, {
    get(target, prop) {
      if (prop === "currentTime" && fakeTime) return totalDuration + 1;
      const value = (target as any)[prop];
      if (typeof value === "function") return value.bind(target);
      return value;
    },
  });

  // Load instruments
  const instrumentIds = [...new Set(score.parts.filter(p => !p.muted).map(p => p.instrumentId))];
  const instruments = new Map<string, Soundfont>();

  for (const id of instrumentIds) {
    const gmName = resolveInstrument(id);
    if (!instruments.has(gmName)) {
      const sf = new Soundfont(proxiedCtx as unknown as AudioContext, { instrument: gmName as any });
      await sf.load;
      instruments.set(gmName, sf);
    }
  }

  onProgress?.({ phase: "rendering", percent: 30 });

  // Schedule all events — with proxied currentTime they all dispatch immediately
  for (const e of events) {
    const gmName = resolveInstrument(e.instrumentId);
    const instrument = instruments.get(gmName);
    if (!instrument) continue;

    // Apply swing
    let swungTick = e.tick;
    const boundary = findBoundary(e.tick, boundaries);
    if (boundary?.swing && boundary.swing.style !== "straight") {
      const tickInMeasure = e.tick - boundary.tick;
      const swungInMeasure = calculateSwingTick(tickInMeasure, boundary.swing, boundary.beatTicks);
      swungTick = boundary.tick + swungInMeasure;
    }

    // Apply backbeat accent
    let vel = e.velocity;
    if (boundary?.swing?.backbeatAccent) {
      const tickInMeasure = e.tick - boundary.tick;
      const beatIndex = Math.floor(tickInMeasure / boundary.beatTicks);
      if (beatIndex % 2 === 1) vel = Math.min(127, vel + boundary.swing.backbeatAccent);
    }

    const time = tickToSeconds(swungTick, score, measureOrder);
    const bpm = getTempoForMeasure(score, findMeasureForTick(swungTick, score, measureOrder));
    const dur = Math.max(ticksToSec(e.durationTicks, bpm) * e.durationMultiplier, 0.05);

    instrument.start({ note: e.midi, duration: dur, time, velocity: vel });
  }

  onProgress?.({ phase: "rendering", percent: 80 });

  // Switch to real currentTime for rendering
  fakeTime = false;
  const audioBuffer = await offlineCtx.startRendering();

  // Encode as 16-bit WAV
  const { audioBufferToWav16 } = await import("smplr");

  onProgress?.({ phase: "encoding", percent: 90 });

  const blob = audioBufferToWav16(audioBuffer);

  onProgress?.({ phase: "encoding", percent: 100 });
  return blob;
}

function findBoundary(tick: number, boundaries: MeasureBoundary[]): MeasureBoundary | undefined {
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (tick >= boundaries[i].tick) return boundaries[i];
  }
  return boundaries[0];
}

function findMeasureForTick(tick: number, score: Score, measureOrder: number[]): number {
  let currentTick = 0;
  for (const mi of measureOrder) {
    const m0 = score.parts[0]?.measures[mi];
    if (!m0) continue;
    const mTicks = (TICKS_PER_QUARTER * 4 * m0.timeSignature.numerator) / m0.timeSignature.denominator;
    if (currentTick + mTicks > tick) return mi;
    currentTick += mTicks;
  }
  return 0;
}
