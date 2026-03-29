import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { Soundfont } from "smplr";
import { setNotePlayer, type NotePlayer } from "../../playback/TonePlayback";

// GM instrument names used by smplr
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
    this.ctx = new AudioContext();
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

  play(midi: number, duration: number, time: number, instrumentId?: string): void {
    const gmName = resolveInstrument(instrumentId ?? "");
    const instrument = this.instruments.get(gmName) ?? this.instruments.values().next().value;
    if (!instrument) return;

    instrument.start({
      note: midi,
      duration,
      time,
    });
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

let player: SmplrPlayer | null = null;

export const SoundFontPlugin: NotationPlugin = {
  id: "notation.soundfont",
  name: "SoundFont Playback",
  version: "1.0.0",
  description: "High-quality instrument playback using SoundFont samples",

  activate(api: PluginAPI) {
    player = new SmplrPlayer();

    // Preload instruments from the current score
    const score = api.getScore();
    const instrumentIds = score.parts.map((p) => p.instrumentId);
    player.preloadForScore(instrumentIds.length > 0 ? instrumentIds : [""]);

    // Set as the active player
    setNotePlayer(player);
  },

  deactivate() {
    if (player) {
      player.stop();
      setNotePlayer(null);
      player = null;
    }
  },
};
