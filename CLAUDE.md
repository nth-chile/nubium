# Notation

AI-native music notation editor. Tauri v2 + React + TypeScript + VexFlow 5.

## Architecture

- **Data model** (`src/model/`): Source of truth. Score → Part → Measure → Voice → NoteEvent (Note | Chord | Rest | Slash). Annotations (chords, lyrics, rehearsal marks, tempo). Navigation marks (repeats, voltas, coda, segno). Instruments, stylesheet, guitar tab info.
- **Serialization** (`src/serialization/`): Custom `.notation` text format. Line-per-note, AI-readable/editable. Swappable layer.
- **Renderer** (`src/renderer/`): VexFlow 5 behind adapter (`vexBridge.ts`). Canvas-based. SystemLayout for multi-part positioning. TabRenderer for guitar tab. Proportional spacing, automatic beaming, adaptive measure widths.
- **Commands** (`src/commands/`): All mutations via Command pattern for undo/redo. InsertNote, DeleteNote, ChangePitch, ChangeDuration, InsertMeasure, DeleteMeasure, SetChordSymbol, SetLyric, SetTempo, SetRepeatBarline, SetVolta, SetNavigationMark, AddPart, RemovePart, and more.
- **State** (`src/state/`): Zustand stores. `useEditorStore` (score, input, rendering), `useChatStore` (AI chat).
- **Views** (`src/views/`): Full Score, Lead Sheet, Songwriter, Tab. Each filters/transforms rendering of the same data model.
- **AI** (`src/ai/`): Chat sidebar, Anthropic + OpenAI providers, score context builder, diff/apply. Presets: /harmonize, /transpose, /fill-drums, /simplify, /bass-line.
- **Playback** (`src/playback/`): Web Audio oscillator synth, lookahead scheduler, transport, metronome, PlaybackOrder (follows repeats/D.S./D.C.).
- **Plugins** (`src/plugins/`): Plugin API with sandboxed instances. Built-ins: Transpose, Retrograde, Augment/Diminish, ChordAnalysis. Command palette (Ctrl+Shift+P).
- **MusicXML** (`src/musicxml/`): Full import/export for interop with MuseScore, Dorico, Sibelius, etc.
- **Settings** (`src/settings/`): AppSettings persisted to localStorage.
- **File I/O** (`src/fileio/`): Tauri native dialogs with browser fallback. .notation and .musicxml.
- **Tauri** (`src-tauri/`): Minimal Rust — file I/O commands.

## Commands

```bash
npm run dev          # Vite dev server (for browser testing)
npm run build        # Production build
npm run test         # Vitest (124 tests)
npm run tauri dev    # Full Tauri desktop app
```

## Keyboard Shortcuts

A-G: insert note | R: rest | 1-7: duration | .: dot | +/-: sharp/flat
Arrow L/R: move cursor | Arrow U/D: octave | Backspace: delete
Ctrl+Z / Ctrl+Shift+Z: undo/redo | Ctrl+S: save | Ctrl+O: open
Ctrl+1-4: switch voice | Ctrl+M: insert measure
Ctrl+Shift+1-4: switch view | Ctrl+Shift+A: AI chat
Ctrl+Shift+P: command palette | Space: play/pause
Shift+C: chord input | Shift+L: lyric input
Alt+Up/Down: navigate between parts

## Serialization Format (.notation)

```
NOTATION v1
title: "Song"
composer: "Author"
tempo: 140

=== PART "Piano" (Pno.) [instrument:piano] ===

--- MEASURE 1 | clef:treble | time:4/4 | key:0 | barline:single ---
@chord 0 Cmaj7
@chord 960 Dm7
@lyric evt_abc "hel-" begin 1
@rehearsal "A"
@tempo 120 quarter "Allegro"
@volta 1
@segno
voice 1:
  C4n q
  D4n q
  E4n q.
  F4# e
  [C4n E4n G4n] h
  r q
  / q
```

Pitch = Class + Octave + Accidental (n/#/b/##/bb)
Duration = w/h/q/e/s/t/x + dots
Tab = tab:string:fret | Articulations = bend:N, slide-up, hammer-on, etc.
