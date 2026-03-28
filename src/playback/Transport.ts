/**
 * Transport: state machine for playback control.
 * States: stopped -> playing -> paused -> stopped
 */

import type { Score } from "../model/score";
import { TICKS_PER_QUARTER } from "../model/duration";
import * as AudioEngine from "./AudioEngine";
import { scheduleScore, buildTimeToTickMap, type ScheduledEvent } from "./Scheduler";
import { scheduleClick } from "./Metronome";

export type TransportState = "stopped" | "playing" | "paused";

export interface TransportOptions {
  onTick: (tick: number) => void;
  onStateChange: (state: TransportState) => void;
}

const LOOKAHEAD_SEC = 0.1; // Schedule 100ms ahead
const SCHEDULE_INTERVAL_MS = 25; // Check every 25ms

let state: TransportState = "stopped";
let scheduledEvents: ScheduledEvent[] = [];
let timeToTick: (time: number) => number = () => 0;
let nextEventIndex = 0;
let playbackStartTime = 0; // AudioContext time when playback started
let playbackStartOffset = 0; // Seconds offset (for resume from pause)
let scheduleTimer: ReturnType<typeof setInterval> | null = null;
let animationFrame: number | null = null;
let currentTempo = 120;
let metronomeEnabled = false;
let onTickCallback: ((tick: number) => void) | null = null;
let onStateChangeCallback: ((state: TransportState) => void) | null = null;
let currentScore: Score | null = null;

// Metronome scheduling state
let nextMetronomeBeatTime = 0;
let currentBeatInMeasure = 0;
let currentMeasureIndex = 0;
let metronomeSecondsPerBeat = 0;

function getState(): TransportState {
  return state;
}

function setState(newState: TransportState): void {
  state = newState;
  onStateChangeCallback?.(newState);
}

function scheduleAhead(): void {
  const ctx = AudioEngine.ensureContext();
  const currentTime = ctx.currentTime;
  const elapsed = currentTime - playbackStartTime + playbackStartOffset;
  const horizon = elapsed + LOOKAHEAD_SEC;

  // Schedule note events
  while (nextEventIndex < scheduledEvents.length) {
    const evt = scheduledEvents[nextEventIndex];
    if (evt.time > horizon) break;

    const audioTime = playbackStartTime + evt.time - playbackStartOffset;
    if (audioTime >= currentTime) {
      AudioEngine.noteOn(evt.midiPitch, audioTime, evt.duration, 0.5, evt.instrumentId);
    }
    nextEventIndex++;
  }

  // Schedule metronome clicks
  if (metronomeEnabled && currentScore) {
    while (nextMetronomeBeatTime <= horizon) {
      const audioTime = playbackStartTime + nextMetronomeBeatTime - playbackStartOffset;
      if (audioTime >= currentTime) {
        const isDownbeat = currentBeatInMeasure === 0;
        scheduleClick(audioTime, isDownbeat);
      }

      // Advance beat
      currentBeatInMeasure++;
      const measure = currentScore.parts[0]?.measures[currentMeasureIndex];
      if (measure && currentBeatInMeasure >= measure.timeSignature.numerator) {
        currentBeatInMeasure = 0;
        currentMeasureIndex++;
      }
      nextMetronomeBeatTime += metronomeSecondsPerBeat;
    }
  }

  // Check if playback is complete
  if (
    nextEventIndex >= scheduledEvents.length &&
    (!metronomeEnabled || currentMeasureIndex >= (currentScore?.parts[0]?.measures.length ?? 0))
  ) {
    // Check if all notes have finished
    const lastEvt = scheduledEvents[scheduledEvents.length - 1];
    if (lastEvt && elapsed > lastEvt.time + lastEvt.duration + 0.5) {
      stop();
    }
  }
}

function updateCursor(): void {
  if (state !== "playing") return;

  const ctx = AudioEngine.ensureContext();
  const elapsed = ctx.currentTime - playbackStartTime + playbackStartOffset;
  const tick = timeToTick(elapsed);
  onTickCallback?.(tick);

  animationFrame = requestAnimationFrame(updateCursor);
}

export function setCallbacks(options: TransportOptions): void {
  onTickCallback = options.onTick;
  onStateChangeCallback = options.onStateChange;
}

export function play(score: Score, fromTick?: number): void {
  if (state === "playing") return;

  currentScore = score;
  currentTempo = score.tempo;

  const ctx = AudioEngine.ensureContext();

  if (state === "stopped" || fromTick !== undefined) {
    // Full restart or seek
    AudioEngine.stop();
    scheduledEvents = scheduleScore(score);
    timeToTick = buildTimeToTickMap(score);
    playbackStartOffset = 0;

    if (fromTick !== undefined && fromTick > 0) {
      // Find the time offset for this tick
      const tickToTimeFn = buildTimeToTickMap(score);
      // We need a tick-to-time, but we have time-to-tick. Approximate:
      let targetTime = 0;
      for (const evt of scheduledEvents) {
        if (evt.tick >= fromTick) {
          targetTime = evt.time;
          break;
        }
      }
      playbackStartOffset = targetTime;
      nextEventIndex = scheduledEvents.findIndex((e) => e.time >= targetTime);
      if (nextEventIndex < 0) nextEventIndex = scheduledEvents.length;
    } else {
      nextEventIndex = 0;
    }

    // Initialize metronome state
    metronomeSecondsPerBeat = 60 / currentTempo;
    currentBeatInMeasure = 0;
    currentMeasureIndex = 0;
    nextMetronomeBeatTime = playbackStartOffset;
  }
  // If resuming from pause, playbackStartOffset is already set

  playbackStartTime = ctx.currentTime;

  scheduleTimer = setInterval(scheduleAhead, SCHEDULE_INTERVAL_MS);
  animationFrame = requestAnimationFrame(updateCursor);

  setState("playing");
}

export function pause(): void {
  if (state !== "playing") return;

  const ctx = AudioEngine.ensureContext();
  const elapsed = ctx.currentTime - playbackStartTime + playbackStartOffset;
  playbackStartOffset = elapsed;

  AudioEngine.stop();
  if (scheduleTimer !== null) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  // Rewind next event index for resume
  nextEventIndex = scheduledEvents.findIndex((e) => e.time >= elapsed);
  if (nextEventIndex < 0) nextEventIndex = scheduledEvents.length;

  setState("paused");
}

export function stop(): void {
  AudioEngine.stop();

  if (scheduleTimer !== null) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  playbackStartOffset = 0;
  nextEventIndex = 0;
  scheduledEvents = [];

  onTickCallback?.(0);
  setState("stopped");
}

export function setTempo(bpm: number): void {
  currentTempo = bpm;
  metronomeSecondsPerBeat = 60 / bpm;
}

export function setMetronome(enabled: boolean): void {
  metronomeEnabled = enabled;
}

export function isMetronomeEnabled(): boolean {
  return metronomeEnabled;
}

export function getTransportState(): TransportState {
  return getState();
}

/**
 * Find the last measure index with actual content across all parts.
 */
function findLastContentMeasure(score: Score): number {
  let last = 0;
  for (const part of score.parts) {
    for (let mi = part.measures.length - 1; mi >= 0; mi--) {
      const m = part.measures[mi];
      if (m.voices.some((v) => v.events.length > 0) ||
          (m.annotations && m.annotations.length > 0)) {
        last = Math.max(last, mi);
        break;
      }
    }
  }
  return last;
}

/**
 * Total duration of the score in seconds (up to last content measure).
 */
export function getScoreDuration(score: Score): number {
  let totalSec = 0;
  if (score.parts.length === 0) return 0;
  const part = score.parts[0];
  const lastContent = findLastContentMeasure(score);
  for (let mi = 0; mi <= lastContent; mi++) {
    const measure = part.measures[mi];
    if (!measure) break;
    const bpm = score.tempo;
    const measureTicks =
      (TICKS_PER_QUARTER * 4 * measure.timeSignature.numerator) /
      measure.timeSignature.denominator;
    totalSec += (measureTicks / TICKS_PER_QUARTER) * (60 / bpm);
  }
  return totalSec;
}
