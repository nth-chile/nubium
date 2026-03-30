import { useState, useCallback } from "react";
import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { useEditorStore } from "../../state";
import { useHotkey } from "../../hooks/useHotkey";
import { TICKS_PER_QUARTER } from "../../model/duration";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TooltipButton } from "@/components/ui/tooltip-button";
import { Play, Pause, Square } from "lucide-react";

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
        <TooltipButton variant="ghost" size="icon" onClick={handlePlayPause} tooltip={isPlaying ? `Pause (${hotkey("play-pause")})` : `Play (${hotkey("play-pause")})`}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </TooltipButton>
        <TooltipButton variant="ghost" size="icon" onClick={() => stopPlayback()} tooltip={`Stop (${hotkey("stop-playback")})`}>
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

  // Find which measure the tick is in
  let accumulated = 0;
  let currentMi = 0;
  for (let mi = 0; mi < part.measures.length; mi++) {
    const ts = part.measures[mi].timeSignature;
    const measureTicks = (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;
    if (accumulated + measureTicks > tick) { currentMi = mi; break; }
    accumulated += measureTicks;
    currentMi = mi;
  }

  // Search backwards for most recent tempo mark
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

export const PlaybackPlugin: NotationPlugin = {
  id: "notation.playback",
  name: "Playback",
  version: "1.0.0",
  description: "Transport bar with play, pause, stop, tempo, and metronome controls",
  activate(api: PluginAPI) {
    api.registerPanel("playback.transport", { title: "Transport", location: "toolbar", component: () => <TransportPanel />, defaultEnabled: true });
    api.registerCommand("notation.play", "Play", () => { useEditorStore.getState().play(); });
    api.registerCommand("notation.pause", "Pause", () => { useEditorStore.getState().pause(); });
    api.registerCommand("notation.stop", "Stop Playback", () => { useEditorStore.getState().stopPlayback(); });
  },
};
