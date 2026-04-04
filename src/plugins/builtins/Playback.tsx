import { useState, useCallback } from "react";
import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import type { PluginManager } from "../PluginManager";
import { useEditorStore } from "../../state";
import { useHotkey } from "../../hooks/useHotkey";
import { TICKS_PER_QUARTER } from "../../model/duration";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TooltipButton } from "@/components/ui/tooltip-button";
import { Play, Pause, Square } from "lucide-react";
import { Soundfont } from "smplr";
import * as Tone from "tone";
import * as Transport from "../../playback/TonePlayback";
import type { NotePlayer } from "../../playback/TonePlayback";

// --- SoundFont instrument player ---

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

class SmplrPlayer implements NotePlayer {
  private instruments = new Map<string, Soundfont>();
  private ctx: AudioContext;
  private loading = new Map<string, Promise<Soundfont>>();

  constructor() {
    this.ctx = Tone.getContext().rawContext as AudioContext;
  }

  async loadInstrument(name: string): Promise<Soundfont> {
    const gmName = resolveInstrument(name);
    const existing = this.instruments.get(gmName);
    if (existing) return existing;

    const pending = this.loading.get(gmName);
    if (pending) return pending;

    const sf = new Soundfont(this.ctx, { instrument: gmName as any });
    this.instruments.set(gmName, sf);
    const loadPromise = sf.load.then(() => sf);
    this.loading.set(gmName, loadPromise);

    return loadPromise;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  play(midi: number, duration: number, time: number, instrumentId?: string, velocity?: number): void {
    const gmName = resolveInstrument(instrumentId ?? "");
    const instrument = this.instruments.get(gmName) ?? this.instruments.values().next().value;
    if (!instrument) return;
    if (this.ctx.state !== "running") return;

    instrument.start({ note: midi, duration, time, velocity: velocity ?? 100 });
  }

  stop(): void {
    for (const instrument of this.instruments.values()) {
      instrument.stop();
    }
  }

  async preloadForScore(instrumentIds: string[]): Promise<void> {
    const unique = [...new Set(instrumentIds.map(resolveInstrument))];
    await Promise.all(unique.map((name) => this.loadInstrument(name)));
  }
}

// --- Transport UI (core) ---

function TransportPanel() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const playbackTick = useEditorStore((s) => s.playbackTick);
  const score = useEditorStore((s) => s.score);
  const metronomeOn = useEditorStore((s) => s.metronomeOn);
  const play = useEditorStore((s) => s.play);
  const pause = useEditorStore((s) => s.pause);
  const stopPlayback = useEditorStore((s) => s.stopPlayback);
  const setTempo = useEditorStore((s) => s.setTempo);
  const toggleMetronome = useEditorStore((s) => s.toggleMetronome);
  const hotkey = useHotkey();

  const [tempoInput, setTempoInput] = useState<string | null>(null);

  const handlePlayPause = useCallback(() => {
    isPlaying ? pause() : play();
  }, [isPlaying, play, pause]);

  const handleTempoCommit = useCallback(() => {
    if (tempoInput !== null) {
      const bpm = parseInt(tempoInput);
      if (!isNaN(bpm) && bpm >= 20 && bpm <= 400) setTempo(bpm);
      setTempoInput(null);
    }
  }, [tempoInput, setTempo]);

  const positionDisplay = formatPosition(playbackTick, score);
  const effectiveBpm = isPlaying ? getEffectiveBpm(playbackTick, score) : score.tempo;

  return (
    <>
      <div className="flex items-center gap-1">
        <TooltipButton variant="ghost" size="icon" onClick={handlePlayPause} tooltip={isPlaying ? `Pause (${hotkey("play-pause")})` : `Play (${hotkey("play-pause")})`} actionId="play-pause">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </TooltipButton>
        <TooltipButton variant="ghost" size="icon" onClick={() => stopPlayback()} tooltip={`Stop — return to beginning (${hotkey("stop-playback")})`} actionId="stop-playback">
          <Square className="h-3.5 w-3.5" />
        </TooltipButton>
      </div>

      <Separator orientation="vertical" />

      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider mr-1">BPM</span>
        <Input
          type="text"
          value={tempoInput !== null ? tempoInput : String(effectiveBpm)}
          onChange={(e) => setTempoInput(e.target.value)}
          onBlur={handleTempoCommit}
          onKeyDown={(e) => { if (e.key === "Enter") handleTempoCommit(); else if (e.key === "Escape") setTempoInput(null); }}
          onFocus={() => setTempoInput(String(score.tempo))}
          className="w-12 h-7 text-center text-sm font-semibold"
        />
      </div>

      <Separator orientation="vertical" />

      <TooltipButton
        variant={metronomeOn ? "secondary" : "ghost"}
        size="icon"
        onClick={toggleMetronome}
        tooltip={`Metronome (${hotkey("toggle-metronome")})`}
        actionId="toggle-metronome"
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5L15 5H9L5 19.5Z" />
          <path d="M9 5h6" />
          <path d="M12 18l4-11" />
          <circle cx="15" cy="10" r="1.5" fill="currentColor" />
        </svg>
      </TooltipButton>

      <Separator orientation="vertical" />

      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider mr-1">Pos</span>
        <span className="text-sm font-semibold font-mono min-w-[48px]">{positionDisplay}</span>
      </div>
    </>
  );
}

function getEffectiveBpm(
  tick: number | null,
  score: { tempo: number; parts: Array<{ measures: Array<{ timeSignature: { numerator: number; denominator: number }; annotations: Array<{ kind: string; bpm?: number }> }> }> }
): number {
  if (tick === null || tick <= 0) return score.tempo;
  const part = score.parts[0];
  if (!part) return score.tempo;

  let accumulated = 0;
  let currentMi = 0;
  for (let mi = 0; mi < part.measures.length; mi++) {
    const ts = part.measures[mi].timeSignature;
    const measureTicks = (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;
    if (accumulated + measureTicks > tick) { currentMi = mi; break; }
    accumulated += measureTicks;
    currentMi = mi;
  }

  for (let i = currentMi; i >= 0; i--) {
    for (const p of score.parts) {
      const m = p.measures[i];
      if (!m) continue;
      for (const ann of m.annotations) {
        if (ann.kind === "tempo-mark" && ann.bpm) return ann.bpm;
      }
    }
  }
  return score.tempo;
}

function formatPosition(
  tick: number | null,
  score: { parts: Array<{ measures: Array<{ timeSignature: { numerator: number; denominator: number } }> }> }
): string {
  if (tick === null || tick <= 0) return "1:1";
  let accumulated = 0;
  const part = score.parts[0];
  if (!part) return "1:1";
  for (let mi = 0; mi < part.measures.length; mi++) {
    const ts = part.measures[mi].timeSignature;
    const measureTicks = (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;
    if (accumulated + measureTicks > tick) {
      const tickInMeasure = tick - accumulated;
      const beatTicks = (TICKS_PER_QUARTER * 4) / ts.denominator;
      return `${mi + 1}:${Math.floor(tickInMeasure / beatTicks) + 1}`;
    }
    accumulated += measureTicks;
  }
  return `${part.measures.length}:1`;
}

// --- Core transport registration ---

/** Register core transport panel and playback commands. Not a plugin — always active. */
export function registerCoreTransport(pm: PluginManager): void {
  pm.registerCorePanel("playback.transport", { title: "Transport", location: "toolbar", component: () => <TransportPanel />, defaultEnabled: true });
  pm.registerCoreCommand("nubium.play", "Play", () => { useEditorStore.getState().play(); });
  pm.registerCoreCommand("nubium.pause", "Pause", () => { useEditorStore.getState().pause(); });
  pm.registerCoreCommand("nubium.stop", "Stop Playback", () => { useEditorStore.getState().stopPlayback(); });
}

// --- Built-in Instruments plugin ---

let player: SmplrPlayer | null = null;

export const BuiltinInstrumentsPlugin: NubiumPlugin = {
  id: "nubium.builtin-instruments",
  name: "Built-in Instruments",
  version: "1.0.0",
  description: "General MIDI instrument sounds via SoundFont",

  activate(api: PluginAPI) {
    player = new SmplrPlayer();
    const score = api.getScore();
    const instrumentIds = score.parts.map((p) => p.instrumentId);
    player.preloadForScore(instrumentIds.length > 0 ? instrumentIds : [""]);
    Transport.setNotePlayer(player);

    api.registerPlaybackService({
      play: (s, startTick) => Transport.play(s, startTick),
      pause: () => Transport.pause(),
      stop: () => Transport.stop(),
      setTempo: (bpm) => Transport.setTempo(bpm),
      setMetronome: (enabled) => Transport.setMetronome(enabled),
      updateScore: (s) => Transport.updateScore(s),
      setCallbacks: (opts) => Transport.setCallbacks(opts),
    });
  },

  deactivate() {
    Transport.stop();
    if (player) {
      player.stop();
      Transport.setNotePlayer(null);
      player = null;
    }
  },
};
