import { useState, useCallback } from "react";
import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { useEditorStore } from "../../state";
import { TICKS_PER_QUARTER } from "../../model/duration";

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

  const [tempoInput, setTempoInput] = useState<string | null>(null);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const handleStop = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const handleTempoChange = useCallback((value: string) => {
    setTempoInput(value);
  }, []);

  const handleTempoCommit = useCallback(() => {
    if (tempoInput !== null) {
      const bpm = parseInt(tempoInput);
      if (!isNaN(bpm) && bpm >= 20 && bpm <= 400) {
        setTempo(bpm);
      }
      setTempoInput(null);
    }
  }, [tempoInput, setTempo]);

  const handleTempoKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleTempoCommit();
      } else if (e.key === "Escape") {
        setTempoInput(null);
      }
    },
    [handleTempoCommit]
  );

  const positionDisplay = formatPosition(playbackTick, score);

  return (
    <div style={styles.bar}>
      <div style={styles.group}>
        <button
          onClick={handlePlayPause}
          style={styles.button}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? "\u23F8" : "\u25B6"}
        </button>
        <button onClick={handleStop} style={styles.button} title="Stop">
          {"\u23F9"}
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.label}>BPM</span>
        <input
          type="text"
          value={tempoInput !== null ? tempoInput : String(score.tempo)}
          onChange={(e) => handleTempoChange(e.target.value)}
          onBlur={handleTempoCommit}
          onKeyDown={handleTempoKeyDown}
          onFocus={() => setTempoInput(String(score.tempo))}
          style={styles.tempoInput}
        />
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <button
          onClick={toggleMetronome}
          style={{
            ...styles.button,
            ...(metronomeOn ? styles.active : {}),
          }}
          title="Metronome"
        >
          {"\uD83E\uDD41"}
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.label}>Pos</span>
        <span style={styles.position}>{positionDisplay}</span>
      </div>
    </div>
  );
}

function formatPosition(
  tick: number | null,
  score: {
    parts: Array<{
      measures: Array<{
        timeSignature: { numerator: number; denominator: number };
      }>;
    }>;
  }
): string {
  if (tick === null || tick <= 0) return "1:1";

  let accumulated = 0;
  const part = score.parts[0];
  if (!part) return "1:1";

  for (let mi = 0; mi < part.measures.length; mi++) {
    const ts = part.measures[mi].timeSignature;
    const measureTicks =
      (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;
    if (accumulated + measureTicks > tick) {
      const tickInMeasure = tick - accumulated;
      const beatTicks = (TICKS_PER_QUARTER * 4) / ts.denominator;
      const beat = Math.floor(tickInMeasure / beatTicks) + 1;
      return `${mi + 1}:${beat}`;
    }
    accumulated += measureTicks;
  }

  return `${part.measures.length}:1`;
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 16px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f1f5f9",
    flexShrink: 0,
  },
  group: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 11,
    color: "#64748b",
    marginRight: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  button: {
    padding: "4px 8px",
    fontSize: 16,
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    background: "#fff",
    cursor: "pointer",
    minWidth: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  active: {
    background: "#2563eb",
    color: "#fff",
    borderColor: "#2563eb",
  },
  tempoInput: {
    width: 48,
    height: 28,
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    textAlign: "center" as const,
    fontSize: 13,
    fontWeight: 600,
    background: "#fff",
    padding: "0 4px",
  },
  position: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1e293b",
    fontFamily: "monospace",
    minWidth: 48,
  },
  divider: {
    width: 1,
    height: 24,
    background: "#e2e8f0",
    margin: "0 4px",
  },
};

export const PlaybackPlugin: NotationPlugin = {
  id: "notation.playback",
  name: "Playback",
  version: "1.0.0",
  description: "Transport bar with play, pause, stop, tempo, and metronome controls",

  activate(api: PluginAPI) {
    api.registerPanel("playback.transport", {
      title: "Transport",
      location: "toolbar",
      component: () => <TransportPanel />,
      defaultEnabled: true,
    });

    api.registerCommand("notation.play", "Play", () => {
      useEditorStore.getState().play();
    });

    api.registerCommand("notation.pause", "Pause", () => {
      useEditorStore.getState().pause();
    });

    api.registerCommand("notation.stop", "Stop Playback", () => {
      useEditorStore.getState().stopPlayback();
    });
  },
};
