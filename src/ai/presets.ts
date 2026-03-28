export interface PresetCommand {
  command: string;
  label: string;
  description: string;
  promptTemplate: string;
}

export const PRESET_COMMANDS: PresetCommand[] = [
  {
    command: "/harmonize",
    label: "Harmonize",
    description: "Add chord symbols that fit the melody",
    promptTemplate:
      "Analyze the melody in the score and add appropriate chord symbols (@chord annotations) that fit the harmonic context. Choose idiomatic chord voicings based on the key and style.",
  },
  {
    command: "/transpose",
    label: "Transpose",
    description: "Transpose all notes by an interval",
    promptTemplate:
      "Transpose all notes in the score by {interval}. Adjust the key signature accordingly. Keep all rhythms, articulations, and other markings the same.",
  },
  {
    command: "/fill-drums",
    label: "Fill Drums",
    description: "Add a drum pattern that matches the groove",
    promptTemplate:
      "Add a drum/percussion part to this score with a rhythmic pattern that complements the existing music. Match the style, tempo, and feel of the piece.",
  },
  {
    command: "/simplify",
    label: "Simplify",
    description: "Simplify the rhythm while keeping the melody",
    promptTemplate:
      "Simplify the rhythms in this score while preserving the essential melody and harmonic structure. Replace complex rhythmic figures with simpler ones (e.g., convert 16th note runs to quarter/eighth note patterns).",
  },
  {
    command: "/bass-line",
    label: "Bass Line",
    description: "Add a bass line that fits the chord progression",
    promptTemplate:
      "Add a bass part to this score that fits the existing harmony and chord progression. Use an appropriate bass instrument and create a musical bass line that supports the existing parts.",
  },
  {
    command: "/demo-melody",
    label: "Demo: Bb 1-4-5-4",
    description: "Write a 1-4-5-4 arpeggiated melody in Bb major",
    promptTemplate:
      "Write an arpeggiated melody in Bb major that follows a 1-4-5-4 chord progression (Bb - Eb - F - Eb). Use 4 measures, one chord per measure, with arpeggiated eighth notes. Key signature should be -2 (Bb major). Make it musical and flowing.",
  },
];

/**
 * Expands a preset command with user arguments.
 * e.g., "/transpose up a major third" -> fills in {interval}
 */
export function expandPreset(input: string): string | null {
  const trimmed = input.trim();
  for (const preset of PRESET_COMMANDS) {
    if (trimmed.startsWith(preset.command)) {
      const args = trimmed.slice(preset.command.length).trim();
      let prompt = preset.promptTemplate;
      // Replace {interval} or any other template variable with args
      if (args) {
        prompt = prompt.replace(/\{(\w+)\}/g, args);
      } else {
        // Remove template variables if no args provided
        prompt = prompt.replace(/\{(\w+)\}/g, "the appropriate amount");
      }
      return prompt;
    }
  }
  return null;
}
