# Notation

AI-native music notation editor. Tauri v2 + React + TypeScript + VexFlow 5.

## Architecture

- **Data model** (`src/model/`): Source of truth. Score → Part → Measure → Voice → NoteEvent (Note | Chord | Rest | Slash | GraceNote). Annotations (chords, lyrics, rehearsal marks, tempo, dynamics, hairpins, slurs). Navigation marks (repeats, voltas, coda, segno). Instruments, stylesheet, guitar tab info. Pickup measures (`isPickup`).
- **Serialization** (`src/serialization/`): JSON-based internal format. Single `json.ts` file handles serialize/deserialize for AI context and undo history.
- **Renderer** (`src/renderer/`): VexFlow 5 behind adapter (`vexBridge.ts`). Canvas-based. SystemLayout for multi-part positioning. TabRenderer for guitar tab. Proportional spacing, automatic beaming, adaptive measure widths.
- **Commands** (`src/commands/`): All mutations via Command pattern for undo/redo. InsertNote, DeleteNote, ChangePitch, ChangeDuration, InsertMeasure, DeleteMeasure, SetChordSymbol, SetLyric, SetTempo, SetRepeatBarline, SetVolta, SetNavigationMark, AddPart, RemovePart, OverwriteNote, SetDynamic, SetSlur, InsertGraceNote, TogglePickup, and more.
- **State** (`src/state/`): Zustand stores. `useEditorStore` (score, input, rendering), `useChatStore` (AI chat), `useLayoutStore` (panels).
- **Views** (`src/views/`): Full Score, Lead Sheet, Songwriter, Tab. Each filters/transforms rendering of the same data model.
- **AI** (`src/ai/`): Chat sidebar, Anthropic + OpenAI + Gemini providers, score context builder, diff/apply.
- **Playback** (`src/playback/`): Web Audio oscillator synth, lookahead scheduler, transport, metronome, PlaybackOrder (follows repeats/D.S./D.C.).
- **Plugins** (`src/plugins/`): Plugin API with sandboxed instances. Built-ins: Transpose, ChordAnalysis, Clipboard, Export, Playback, PartManager, ScoreEditor, SoundFont, Lyrics, TitleDisplay, Views, AIChat, MidiInput. Command palette (Ctrl+Shift+P).
- **MusicXML** (`src/musicxml/`): Full import/export for interop with MuseScore, Dorico, Sibelius, etc.
- **Settings** (`src/settings/`): AppSettings + keybindings persisted to Tauri config file (`~/Library/Application Support/com.notation.app/settings.json` on macOS) with localStorage fallback in browser.
- **File I/O** (`src/fileio/`): Tauri native dialogs with browser fallback. Import: .musicxml, .mxl, .xml. Export: .musicxml, .pdf.
- **Tauri** (`src-tauri/`): Minimal Rust — file I/O commands.

## Commands

```bash
npm run dev          # Vite dev server (for browser testing)
npm run build        # Production build
npm run test         # Vitest (370 tests)
npm run tauri dev    # Full Tauri desktop app

VITE_CLEAN_SETTINGS=1 npm run dev        # Simulate fresh install (ignores saved settings)
VITE_CLEAN_SETTINGS=1 npm run tauri dev  # Same for desktop
```

## Keyboard Shortcuts

A-G: insert note | R: rest | 1-7: duration (bulk-applies to selection) | .: dot | =/- : sharp/flat
Arrow L/R: move cursor | Arrow U/D: octave | Backspace: delete
Ctrl+Z / Ctrl+Shift+Z: undo/redo | Ctrl+S: save | Ctrl+O: open
Ctrl+1-4: switch voice | Ctrl+M: insert measure
Ctrl+Shift+1-4: switch view | Ctrl+Shift+A: AI chat
Ctrl+Shift+P: command palette | Space: play/pause
Shift+C: chord input | Shift+L: lyric input
Shift+D: dynamics | Shift+G: grace note mode | Shift+S: slur (start/end)
Shift+R: rehearsal mark | Shift+B: barline
Ctrl+T: time signature | Ctrl+K: key signature | Ctrl+Shift+T: tempo
N: step entry mode | Alt+Up/Down: navigate between parts

## Internal JSON Format

JSON representation used for AI context, undo history, and clipboard. Files are saved as MusicXML.

```json
{
  "formatVersion": 1,
  "title": "Song",
  "composer": "Author",
  "tempo": 140,
  "parts": [
    {
      "name": "Piano",
      "abbreviation": "Pno.",
      "instrument": "piano",
      "measures": [
        {
          "number": 1,
          "time": "4/4",
          "key": 0,
          "clef": "treble",
          "annotations": [
            { "type": "chord", "beat": 0, "symbol": "Cmaj7" },
            { "type": "rehearsal", "label": "A" },
            { "type": "tempo", "bpm": 120, "beatUnit": "quarter", "text": "Allegro" },
            { "type": "dynamic", "level": "ff", "noteEventId": "evt_..." }
          ],
          "navigation": { "segno": true, "volta": { "endings": [1] } },
          "voices": [
            {
              "events": [
                { "type": "note", "pitch": "C4", "duration": "quarter" },
                { "type": "note", "pitch": "F4", "accidental": "sharp", "duration": "eighth" },
                { "type": "chord", "pitches": ["C4", "E4", "G4"], "duration": "half" },
                { "type": "rest", "duration": "quarter" },
                { "type": "slash", "duration": "quarter" },
                { "type": "grace", "pitch": "B3", "duration": "eighth", "slash": true }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Pitches: Letter + octave (C4 = middle C). Accidentals: "sharp", "flat", "double-sharp", "double-flat".
Durations: "whole", "half", "quarter", "eighth", "16th", "32nd", "64th". Append "." for dotted.
Key signatures (fifths): -7 to 7. Barlines: single, double, final, repeat-start, repeat-end, repeat-both.

## Gotchas

- **`roundRect` not available everywhere.** Always guard: `if (rawCtx.roundRect) { rawCtx.roundRect(...) } else { rawCtx.rect(...) }`. Crashes canvas rendering without this.
- **VexFlow tick mismatch.** `joinVoices()` and `format()` throw when voices have different total ticks (e.g., voice 2 not fully filled). These calls are wrapped in try/catch in `vexBridge.ts` — don't remove the try/catch.
- **Time/key sig changes apply to all parts.** `ChangeTimeSig` and `ChangeKeySig` commands iterate all parts at the measure. Don't change this to single-part.
- **GitHub issues are linked.** Related issues have "Related: #X, #Y" comments. Always read issue comments before starting work — fix related issues together.
- **Use `/fix-issues` for bug fix groups.** It reads related issues together, fixes them, writes tests, and submits a PR.
- **Run `/test-changes` after finishing work.** It writes unit tests and updates GitHub issues.
- **Run `/triage-issues` after closing issues.** It catches unaddressed items in comments and links related issues.
- **Run `/convo-review` before ending a conversation.** It saves context to memory, surfaces loose ends, and keeps the README up to date.
- **Work on a branch, not main.** Create a branch named after the issue group (e.g., `fix/voice-bugs`, `fix/selection`). Submit a PR when done. This prevents parallel agents from stepping on each other.
- **Push back on bad fixes.** Don't force a change just because an issue says so. If the current behavior is correct or the fix would make things worse, explain your reasoning to the user and comment on the GitHub issue — don't silently skip it.
