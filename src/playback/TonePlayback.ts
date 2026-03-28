/**
 * Tone.js playback — schedules notes at absolute audio times.
 * Does NOT use Tone.Transport BPM (which distorts timing).
 */
import * as Tone from "tone";
import type { Score } from "../model/score";
import { durationToTicks, TICKS_PER_QUARTER } from "../model/duration";
import { pitchToMidi } from "../model/pitch";
import type { TempoMark } from "../model/annotations";

export type TransportState = "stopped" | "playing" | "paused";

export interface TransportOptions {
  onTick: (tick: number) => void;
  onStateChange: (state: TransportState) => void;
}

interface ScheduledNote {
  time: number;  // seconds from start
  midi: number;
  duration: number;  // seconds
}

let state: TransportState = "stopped";
let onTickCallback: ((tick: number) => void) | null = null;
let onStateChangeCallback: ((state: TransportState) => void) | null = null;
let metronomeEnabled = false;
let animationFrame: number | null = null;
let playbackStartTime = 0;
let totalDuration = 0;
let synth: Tone.PolySynth | null = null;
let tickBoundaries: { time: number; tick: number }[] = [];

function setState(s: TransportState): void {
  state = s;
  onStateChangeCallback?.(s);
}

function ensureSynth(): Tone.PolySynth {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.3 },
    }).toDestination();
    synth.maxPolyphony = 32;
    synth.volume.value = -6;
  }
  return synth;
}

function midiToNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function getTempoForMeasure(score: Score, mi: number): number {
  for (const part of score.parts) {
    const m = part.measures[mi];
    if (!m) continue;
    for (const ann of m.annotations) {
      if (ann.kind === "tempo-mark") return (ann as TempoMark).bpm;
    }
  }
  return score.tempo;
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

function ticksToSec(ticks: number, bpm: number): number {
  return (ticks / TICKS_PER_QUARTER) * (60 / bpm);
}

function buildSchedule(score: Score): {
  notes: ScheduledNote[];
  duration: number;
  boundaries: { time: number; tick: number }[];
} {
  const notes: ScheduledNote[] = [];
  const boundaries: { time: number; tick: number }[] = [{ time: 0, tick: 0 }];
  const lastMi = findLastContentMeasure(score);
  let time = 0;
  let tick = 0;

  for (let mi = 0; mi <= lastMi; mi++) {
    const bpm = getTempoForMeasure(score, mi);

    for (const part of score.parts) {
      if (part.muted) continue;
      const m = part.measures[mi];
      if (!m) continue;

      for (const voice of m.voices) {
        let offset = 0;
        for (const evt of voice.events) {
          const evtTicks = durationToTicks(evt.duration);
          const evtTime = time + ticksToSec(offset, bpm);
          const evtDur = ticksToSec(evtTicks, bpm);

          if (evt.kind === "note") {
            notes.push({ time: evtTime, midi: pitchToMidi(evt.head.pitch), duration: evtDur });
          } else if (evt.kind === "chord") {
            for (const h of evt.heads) {
              notes.push({ time: evtTime, midi: pitchToMidi(h.pitch), duration: evtDur });
            }
          }
          offset += evtTicks;
        }
      }
    }

    // Advance by full measure duration
    const m0 = score.parts[0]?.measures[mi];
    if (m0) {
      const mTicks = (TICKS_PER_QUARTER * 4 * m0.timeSignature.numerator) / m0.timeSignature.denominator;
      time += ticksToSec(mTicks, getTempoForMeasure(score, mi));
      tick += mTicks;
    }
    boundaries.push({ time, tick });
  }

  return { notes, duration: time, boundaries };
}

function timeToTick(t: number): number {
  for (let i = 1; i < tickBoundaries.length; i++) {
    if (t <= tickBoundaries[i].time) {
      const prev = tickBoundaries[i - 1];
      const curr = tickBoundaries[i];
      const frac = (t - prev.time) / (curr.time - prev.time || 1);
      return prev.tick + frac * (curr.tick - prev.tick);
    }
  }
  return tickBoundaries[tickBoundaries.length - 1]?.tick ?? 0;
}

function updateCursor(): void {
  if (state !== "playing") return;
  const elapsed = Tone.now() - playbackStartTime;
  onTickCallback?.(timeToTick(elapsed));
  if (elapsed >= totalDuration + 0.3) {
    stop();
    return;
  }
  animationFrame = requestAnimationFrame(updateCursor);
}

// --- Public API ---

export function setCallbacks(opts: TransportOptions): void {
  onTickCallback = opts.onTick;
  onStateChangeCallback = opts.onStateChange;
}

export async function play(score: Score): Promise<void> {
  if (state === "playing") return;
  await Tone.start();

  const s = ensureSynth();
  const schedule = buildSchedule(score);
  totalDuration = schedule.duration;
  tickBoundaries = schedule.boundaries;

  if (schedule.notes.length === 0) return;

  // Schedule every note at an absolute audio-context time
  playbackStartTime = Tone.now() + 0.05; // tiny buffer

  for (const note of schedule.notes) {
    const name = midiToNoteName(note.midi);
    const startAt = playbackStartTime + note.time;
    const dur = Math.max(note.duration * 0.9, 0.05);
    s.triggerAttackRelease(name, dur, startAt);
  }

  animationFrame = requestAnimationFrame(updateCursor);
  setState("playing");
}

export function pause(): void {
  if (state !== "playing") return;
  // Can't truly pause pre-scheduled oscillators — just stop
  stop();
}

export function stop(): void {
  if (synth) {
    synth.releaseAll();
  }
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  onTickCallback?.(0);
  setState("stopped");
}

export function setTempo(_bpm: number): void {
  // Tempo is read from the score at play time
}

export function setMetronome(enabled: boolean): void {
  metronomeEnabled = enabled;
}

export function isMetronomeEnabled(): boolean {
  return metronomeEnabled;
}

export function getTransportState(): TransportState {
  return state;
}

export function getScoreDuration(score: Score): number {
  return buildSchedule(score).duration;
}
