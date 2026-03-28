# Notation

AI-native music notation editor. Tauri v2 + React + TypeScript + VexFlow 5.

## Architecture

- **Data model** (`src/model/`): Source of truth. Score → Part → Measure → Voice → NoteEvent (Note | Chord | Rest). All pitches explicit (no relative), all durations explicit.
- **Serialization** (`src/serialization/`): Custom `.notation` text format. Line-per-note, AI-readable/editable. Swappable layer.
- **Renderer** (`src/renderer/`): VexFlow 5 behind adapter (`vexBridge.ts`). Canvas-based.
- **Commands** (`src/commands/`): All mutations via Command pattern for undo/redo. `CommandHistory` uses snapshot-based undo.
- **State** (`src/state/`): Zustand store. Single `useEditorStore`.
- **Input** (`src/input/`): Keyboard shortcuts (A-G for notes, 1-7 for durations, arrows for cursor).
- **File I/O** (`src/fileio/`): Tauri native dialogs with browser fallback.
- **Tauri** (`src-tauri/`): Minimal Rust — just `save_file`/`load_file` commands.

## Commands

```bash
npm run dev          # Vite dev server (for browser testing)
npm run build        # Production build
npm run test         # Vitest
npm run tauri dev    # Full Tauri desktop app
```

## Keyboard Shortcuts

A-G: insert note | R: rest | 1-7: duration | .: dot | +/-: sharp/flat
Arrow L/R: move cursor | Arrow U/D: octave | Backspace: delete
Ctrl+Z/Ctrl+Shift+Z: undo/redo | Ctrl+S: save | Ctrl+O: open

## Serialization Format (.notation)

```
NOTATION v1
title: "Song"
composer: "Author"

=== PART "Piano" (Pno.) ===

--- MEASURE 1 | clef:treble | time:4/4 | key:0 | barline:single ---
voice 1:
  C4n q
  D4n q
  E4n q.
  F4# e
```

Pitch = Class + Octave + Accidental (n/#/b/##/bb)
Duration = w/h/q/e/s/t/x + dots
