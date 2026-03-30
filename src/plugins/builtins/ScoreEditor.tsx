import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import { useEditorStore } from "../../state";
import { useHotkey } from "../../hooks/useHotkey";
import type { DurationType, Accidental } from "../../model";
import { Separator } from "@/components/ui/separator";
import { TooltipButton } from "@/components/ui/tooltip-button";

const DURATIONS: { type: DurationType; label: string; actionId: string }[] = [
  { type: "whole", label: "W", actionId: "duration:whole" },
  { type: "half", label: "H", actionId: "duration:half" },
  { type: "quarter", label: "Q", actionId: "duration:quarter" },
  { type: "eighth", label: "8", actionId: "duration:eighth" },
  { type: "16th", label: "16", actionId: "duration:16th" },
  { type: "32nd", label: "32", actionId: "duration:32nd" },
];

const ACCIDENTALS: { acc: Accidental; label: string }[] = [
  { acc: "flat", label: "\u266D" },
  { acc: "natural", label: "\u266E" },
  { acc: "sharp", label: "\u266F" },
];

function NoteInputPanel() {
  const inputState = useEditorStore((s) => s.inputState);
  const setDuration = useEditorStore((s) => s.setDuration);
  const toggleDot = useEditorStore((s) => s.toggleDot);
  const setAccidental = useEditorStore((s) => s.setAccidental);
  const toggleStepEntry = useEditorStore((s) => s.toggleStepEntry);
  const toggleGraceNoteMode = useEditorStore((s) => s.toggleGraceNoteMode);
  const hotkey = useHotkey();

  return (
    <>
      <div className="flex items-center gap-1">
        <TooltipButton
          variant={inputState.stepEntry ? "default" : "ghost"}
          size="icon"
          onClick={toggleStepEntry}
          tooltip={`Step entry (${hotkey("toggle-step-entry")})`}
          className="text-xs font-bold"
        >
          N
        </TooltipButton>
        <TooltipButton
          variant={inputState.graceNoteMode ? "default" : "ghost"}
          size="icon"
          onClick={toggleGraceNoteMode}
          tooltip={`Grace note (${hotkey("toggle-grace-note")})`}
          className="text-xs font-bold italic"
        >
          G
        </TooltipButton>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider mr-1">Duration</span>
        {DURATIONS.map((d) => (
          <TooltipButton
            key={d.type}
            variant={inputState.duration.type === d.type ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setDuration(d.type)}
            tooltip={`${d.type} (${hotkey(d.actionId)})`}
            className="text-base"
          >
            {d.label}
          </TooltipButton>
        ))}
        <TooltipButton
          variant={inputState.duration.dots > 0 ? "secondary" : "ghost"}
          size="icon"
          onClick={toggleDot}
          tooltip={`Dot (${hotkey("toggle-dot")})`}
          className="text-base"
        >
          {"\u2022"}{inputState.duration.dots > 0 ? inputState.duration.dots : ""}
        </TooltipButton>
      </div>

      <Separator orientation="vertical" />

      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider mr-1">Accidental</span>
        {ACCIDENTALS.map((a) => (
          <TooltipButton
            key={a.acc}
            variant={inputState.accidental === a.acc && a.acc !== "natural" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setAccidental(a.acc)}
            tooltip={hotkey(`accidental:${a.acc}`) ? `${a.acc} (${hotkey(`accidental:${a.acc}`)})` : a.acc}
            className="text-base"
          >
            {a.label}
          </TooltipButton>
        ))}
      </div>

      <Separator orientation="vertical" />

      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider mr-1">Octave</span>
        <span className="text-sm font-semibold min-w-[20px] text-center">{inputState.octave}</span>
      </div>
    </>
  );
}

export const ScoreEditorPlugin: NotationPlugin = {
  id: "notation.score-editor",
  name: "Score Editor",
  version: "1.0.0",
  description: "Duration, accidental, octave, and dot note input controls",
  activate(api: PluginAPI) {
    api.registerPanel("score-editor.note-input", { title: "Note Input", location: "toolbar", component: () => <NoteInputPanel />, defaultEnabled: true });

    api.registerCommand("notation.file-history", "File History", () => {
      import("../../components/HistoryModal").then((m) => m.showHistoryModal());
    });

    api.registerCommand("notation.go-to-measure", "Go to measure...", () => {
      const input = prompt("Go to measure:");
      if (!input) return;
      const num = parseInt(input, 10);
      if (isNaN(num) || num < 1) return;
      const store = useEditorStore.getState();
      const part = store.score.parts[store.inputState.cursor.partIndex];
      if (!part) return;
      const measureIndex = Math.min(num - 1, part.measures.length - 1);
      store.setCursorDirect({
        ...store.inputState.cursor,
        measureIndex,
        eventIndex: 0,
      });
    });
  },
};
