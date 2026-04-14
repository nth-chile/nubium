# Nubium

Music notation editor. Tauri v2 + React + TypeScript + VexFlow 5.

## Architecture

- **Data model** (`src/model/`): Source of truth. Score → Part → Measure → Voice → NoteEvent (Note | Chord | Rest | Slash | GraceNote). Annotations (chords, lyrics, rehearsal marks, tempo, dynamics, hairpins, slurs). Navigation marks (repeats, voltas, coda, segno). Instruments, stylesheet, guitar tab info. Pickup measures (`isPickup`).
- **Serialization** (`src/serialization/`): JSON-based internal format. Single `json.ts` file handles serialize/deserialize for AI context and undo history.
- **Renderer** (`src/renderer/`): VexFlow 5 behind adapter (`vexBridge.ts`). Canvas-based. SystemLayout for multi-part positioning. TabRenderer for guitar tab. Proportional spacing, automatic beaming, adaptive measure widths.
- **Commands** (`src/commands/`): All mutations via Command pattern for undo/redo. InsertNote, DeleteNote, ChangePitch, ChangeDuration, InsertMeasure, DeleteMeasure, SetChordSymbol, SetLyric, SetTempo, SetRepeatBarline, SetVolta, SetNavigationMark, AddPart, RemovePart, OverwriteNote, SetDynamic, SetSlur, InsertGraceNote, TogglePickup, and more.
- **State** (`src/state/`): Zustand stores. `useEditorStore` (score, input, rendering), `useChatStore` (AI chat), `useLayoutStore` (panels).
- **Views** (`src/views/`): Per-part notation display toggles (standard, tab, slash). ViewConfig controls which parts are shown, notation display per part, annotation filters, and layout.
- **AI** (`src/ai/`): Chat sidebar, Anthropic + OpenAI + Gemini providers, score context builder, diff/apply.
- **Playback** (`src/playback/`): SoundFont-based instrument playback, lookahead scheduler, transport, metronome, swing/shuffle modes, PlaybackOrder (follows repeats/D.S./D.C.). WAV export via offline rendering.
- **Plugins** (`src/plugins/`): Plugin API with sandboxed instances. Core features (ScoreEditor, PartManager, Transport) register via `registerCoreCommand`/`registerCorePanel` — always active, not in plugin panel. Real plugins (toggleable): Built-in Instruments, Export, Transpose, ChordAnalysis, Clipboard, AIChat, MidiInput. Community plugin registry (`nubium-plugins` repo) with in-app browser/install. Command palette (Ctrl+Shift+P).
- **MusicXML** (`src/musicxml/`): Full import/export for interop with MuseScore, Dorico, Sibelius, etc.
- **Settings** (`src/settings/`): AppSettings + keybindings persisted to Tauri config file (`~/Library/Application Support/com.nubium.app/settings.json` on macOS) with localStorage fallback in browser. Display settings (show/hide lyrics, chord symbols, rehearsal marks, tempo marks, dynamics) are app-level, not per-score.
- **File I/O** (`src/fileio/`): Tauri native dialogs with browser fallback. Import: .musicxml, .mxl, .xml. Export: .musicxml, .pdf, .wav.
- **Tauri** (`src-tauri/`): Minimal Rust — file I/O, native MIDI bridge (macOS WebKit).

## Commands

```bash
npm run dev          # Vite dev server (for browser testing)
npm run build        # Production build
npm run test         # Vitest (530+ tests)
npm run tauri dev    # Full Tauri desktop app

VITE_CLEAN_SETTINGS=1 npm run dev        # Simulate fresh install (ignores saved settings)
VITE_CLEAN_SETTINGS=1 npm run tauri dev  # Same for desktop
```

## Keyboard Shortcuts

The editor has two top-level modes: **Normal** (default) and **Note Entry**. Press `N` to toggle. In Normal mode letter keys are command shortcuts; in Note Entry mode they insert notes. `Escape` exits Note Entry back to Normal.

**Note Entry mode:**
- A-G: insert note | R: rest | 1-7: duration | .: dot | =/- : sharp/flat
- Shift+A-G: add pitch to chord at cursor
- I: insert sub-mode (push existing notes forward) | K: pitch-before-duration | Shift+G: grace note

**Normal mode (commands):**
- C: chord symbol | L: lyric | D: dynamics | B: barline | R: rehearsal mark | Shift+N: navigation marks
- S: slur | T: tie | M: metronome | X: cross-staff | U: fermata | Shift+M: mute (suppress playback)
- Backspace: delete selection or note at caret

**Both modes:**
- [ / ]: cycle to previous/next chord head
- Arrow L/R: move cursor | Arrow U/D: navigate parts | Enter: go to beginning | Ctrl+G: go to measure
- Alt+Up/Down: diatonic pitch | Shift+Alt+Up/Down: chromatic | Ctrl+Alt+Up/Down: octave
- Shift+Arrow L/R: extend measure selection | Alt+Shift+Arrow L/R: extend note selection
- Ctrl+A: select all | Ctrl+C/X/V: copy/cut/paste | Ctrl+Z/Shift+Z: undo/redo
- Ctrl+M: insert measure | Ctrl+Backspace: delete measure | Ctrl+1-4: voice
- Ctrl+T: time sig | Ctrl+K: key sig | Ctrl+Shift+T: tempo | Shift+Alt+,/.: crescendo/diminuendo
- Shift+>: accent | Shift+<: staccato | Shift+_: tenuto | Shift+^: marcato | Shift+Alt+R: trill
- Space: play/pause | Ctrl+.: stop | Shift+I: count-in
- Ctrl+N: new | Ctrl+O: open | Ctrl+S: save | Ctrl+Shift+H: file history
- Ctrl+,: settings | Ctrl+B: left sidebar | Ctrl+Shift+B: right sidebar | Ctrl+Shift+P: command palette | Ctrl+Shift+E: plugins | Ctrl+Shift+A: AI chat
- Ctrl+Shift+1/2/3: toggle standard/tab/slash notation

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
                { "id": "evt_1", "type": "note", "pitch": "C4", "duration": "quarter" },
                { "id": "evt_2", "type": "note", "pitch": "F4#", "duration": "eighth" },
                { "id": "evt_3", "type": "chord", "pitches": ["C4", "E4", "G4"], "duration": "half" },
                { "id": "evt_4", "type": "rest", "duration": "quarter" },
                { "id": "evt_5", "type": "slash", "duration": "quarter" },
                { "id": "evt_6", "type": "grace", "pitch": "B3", "duration": "eighth", "slash": true }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Pitches: Letter + octave + accidental suffix (C4 = middle C, F4# = F sharp 4, Bb3 = B flat 3, A5## = A double-sharp 5).
Durations: "whole", "half", "quarter", "eighth", "16th", "32nd", "64th". Append "." for dotted.
Key signatures (fifths): -7 to 7. Barlines: single, double, final, repeat-start, repeat-end, repeat-both.

## Testing

**Test in both environments.** Features that touch file I/O, settings, clipboard, MIDI, or native dialogs must be tested in both `npm run dev` (browser) and `npm run tauri dev` (Tauri desktop). Browser uses fallbacks (localStorage, HTML file input, blob download); Tauri uses native APIs.

## Gotchas

- **`roundRect` not available everywhere.** Always guard: `if (rawCtx.roundRect) { rawCtx.roundRect(...) } else { rawCtx.rect(...) }`. Crashes canvas rendering without this.
- **VexFlow tick mismatch.** `joinVoices()` and `format()` throw when voices have different total ticks (e.g., voice 2 not fully filled). These calls are wrapped in try/catch in `vexBridge.ts` — don't remove the try/catch.
- **Time/key sig changes apply to all parts.** `ChangeTimeSig` and `ChangeKeySig` commands iterate all parts at the measure. Don't change this to single-part.
- **GitHub issues are linked.** Related issues have "Related: #X, #Y" comments. Always read issue comments before starting work — fix related issues together.
- **Use `/fix-issues` for bug fix groups.** It reads related issues together, analyzes them, fixes them, and writes tests.
- **Run `/test-changes` after finishing work.** It writes unit tests and updates GitHub issues.
- **Run `/convo-review` before ending a conversation.** It saves context to memory, surfaces loose ends, and keeps the README up to date.
- **Use `/release [version]` to ship.** Bumps version, commits, tags, pushes, waits for CI, publishes, verifies `latest.json`. Auto-increments patch if no version given.
- **Work on a branch, not main.** Create a branch named after the issue group (e.g., `fix/voice-bugs`, `fix/selection`). Submit a PR when done. This prevents parallel agents from stepping on each other.
- **Push back on bad fixes.** Don't force a change just because an issue says so. If the current behavior is correct or the fix would make things worse, explain your reasoning to the user and comment on the GitHub issue — don't silently skip it.
