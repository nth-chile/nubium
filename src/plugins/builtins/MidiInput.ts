import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import { midiToPitch } from "../../model/pitch";
import type { PitchClass, Octave } from "../../model/pitch";
import { useEditorStore } from "../../state/EditorState";

let midiAccess: MIDIAccess | null = null;
let inputListeners: Array<() => void> = [];

function handleMidiMessage(e: MIDIMessageEvent) {
  const data = e.data;
  if (!data || data.length < 3) return;

  const status = data[0] & 0xf0;
  const note = data[1];
  const velocity = data[2];

  // Note On (0x90) with velocity > 0
  if (status === 0x90 && velocity > 0) {
    const pitch = midiToPitch(note);
    const store = useEditorStore.getState();
    // Set octave from MIDI note, set accidental, then insert
    const currentInput = store.inputState;
    if (pitch.octave !== currentInput.octave) {
      // Directly update octave to match MIDI input
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

function connectInputs(access: MIDIAccess) {
  // Clean up old listeners
  for (const cleanup of inputListeners) cleanup();
  inputListeners = [];

  for (const input of access.inputs.values()) {
    input.onmidimessage = handleMidiMessage;
    inputListeners.push(() => { input.onmidimessage = null; });
  }
}

export const MidiInputPlugin: NubiumPlugin = {
  id: "nubium.midi-input",
  name: "MIDI Input",
  version: "1.0.0",
  description: "MIDI keyboard input for step-entry note entry",

  async activate(_api: PluginAPI) {
    if (!navigator.requestMIDIAccess) return;

    try {
      midiAccess = await navigator.requestMIDIAccess();
      connectInputs(midiAccess);

      // Re-connect when devices change
      midiAccess.onstatechange = () => {
        if (midiAccess) connectInputs(midiAccess);
      };
    } catch {
      // MIDI access denied or unavailable
    }
  },

  deactivate() {
    for (const cleanup of inputListeners) cleanup();
    inputListeners = [];
    if (midiAccess) {
      midiAccess.onstatechange = null;
      midiAccess = null;
    }
  },
};
