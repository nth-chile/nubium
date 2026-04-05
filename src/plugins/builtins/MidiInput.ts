import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import { midiToPitch } from "../../model/pitch";
import type { PitchClass, Octave } from "../../model/pitch";
import { useEditorStore } from "../../state/EditorState";

let midiAccess: MIDIAccess | null = null;
let inputListeners: Array<() => void> = [];
let tauriUnlisten: (() => void) | null = null;
let usingTauriBridge = false;

function handleMidiData(status: number, note: number, velocity: number) {
  // Note On (0x90) with velocity > 0
  if ((status & 0xf0) === 0x90 && velocity > 0) {
    const pitch = midiToPitch(note);
    const store = useEditorStore.getState();
    const currentInput = store.inputState;
    if (pitch.octave !== currentInput.octave) {
      useEditorStore.setState((s) => ({
        inputState: { ...s.inputState, octave: pitch.octave as Octave },
      }));
    }
    if (pitch.accidental !== "natural") {
      useEditorStore.setState((s) => ({
        inputState: { ...s.inputState, accidental: pitch.accidental },
      }));
    }
    store.insertNote(pitch.pitchClass as PitchClass);
  }
}

function handleMidiMessage(e: MIDIMessageEvent) {
  const data = e.data;
  if (!data || data.length < 3) return;
  handleMidiData(data[0], data[1], data[2]);
}

function connectInputs(access: MIDIAccess) {
  for (const cleanup of inputListeners) cleanup();
  inputListeners = [];

  for (const input of access.inputs.values()) {
    input.onmidimessage = handleMidiMessage;
    inputListeners.push(() => { input.onmidimessage = null; });
  }
}

/** Try Tauri native MIDI bridge (works on macOS WebKit where Web MIDI is unavailable). */
async function activateTauriBridge(): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");

    const inputs = await invoke<string[]>("midi_list_inputs");
    if (inputs.length === 0) return false;

    // Connect to first available input
    await invoke("midi_connect", { portIndex: 0 });

    tauriUnlisten = (await listen<{ status: number; note: number; velocity: number }>(
      "midi-message",
      (event) => {
        handleMidiData(event.payload.status, event.payload.note, event.payload.velocity);
      },
    )) as unknown as () => void;

    usingTauriBridge = true;
    return true;
  } catch {
    return false;
  }
}

async function deactivateTauriBridge() {
  if (!usingTauriBridge) return;
  try {
    if (tauriUnlisten) { tauriUnlisten(); tauriUnlisten = null; }
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("midi_disconnect");
  } catch {
    // ignore
  }
  usingTauriBridge = false;
}

export const MidiInputPlugin: NubiumPlugin = {
  id: "nubium.midi-input",
  name: "MIDI Input",
  version: "1.0.0",
  description: "MIDI keyboard input for step-entry note entry",

  async activate(_api: PluginAPI) {
    // Try Web MIDI API first (works in Chromium-based webviews)
    if (navigator.requestMIDIAccess) {
      try {
        midiAccess = await navigator.requestMIDIAccess();
        connectInputs(midiAccess);
        midiAccess.onstatechange = () => {
          if (midiAccess) connectInputs(midiAccess);
        };
        return;
      } catch {
        // Web MIDI denied or failed — try Tauri bridge
      }
    }

    // Fall back to Tauri native MIDI bridge (macOS WebKit)
    await activateTauriBridge();
  },

  deactivate() {
    for (const cleanup of inputListeners) cleanup();
    inputListeners = [];
    if (midiAccess) {
      midiAccess.onstatechange = null;
      midiAccess = null;
    }
    deactivateTauriBridge();
  },
};
