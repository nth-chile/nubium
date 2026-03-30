import { useRef, useEffect, useMemo } from "react";
import { useEditorStore } from "../state";
import { Input } from "./ui/input";

export function TextInput() {
  const textInputMode = useEditorStore((s) => s.inputState.textInputMode);
  const textInputInitialValue = useEditorStore((s) => s.inputState.textInputInitialValue);
  const commitTextInput = useEditorStore((s) => s.commitTextInput);
  const cancelTextInput = useEditorStore((s) => s.cancelTextInput);
  const cursor = useEditorStore((s) => s.inputState.cursor);
  const noteBoxes = useEditorStore((s) => s.noteBoxes);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textInputMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.value = textInputInitialValue || "";
      // Place cursor at end when pre-populated
      if (textInputInitialValue) {
        inputRef.current.select();
      }
    }
  }, [textInputMode, textInputInitialValue, cursor.measureIndex, cursor.eventIndex]);

  // Find the position of the current note for positioning
  const notePosition = useMemo(() => {
    if (!textInputMode) return null;

    for (const box of noteBoxes.values()) {
      if (
        box.partIndex === cursor.partIndex &&
        box.measureIndex === cursor.measureIndex &&
        box.voiceIndex === cursor.voiceIndex &&
        box.eventIndex === cursor.eventIndex
      ) {
        return {
          x: box.x + box.width / 2,
          y: box.y,
          height: box.height,
        };
      }
    }
    return null;
  }, [textInputMode, noteBoxes, cursor.partIndex, cursor.measureIndex, cursor.voiceIndex, cursor.eventIndex]);

  if (!textInputMode) return null;

  const label = textInputMode === "chord" ? "Chord:" : "Lyric:";

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTextInput(inputRef.current?.value ?? "");
      // Clear input for next entry
      if (inputRef.current) inputRef.current.value = "";
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelTextInput();
    }
  }

  // Position near the note: chords above, lyrics below
  const scoreContainer = document.querySelector("[data-score-container]");
  const containerRect = scoreContainer?.getBoundingClientRect();

  let positionStyle: React.CSSProperties;
  if (notePosition && containerRect) {
    if (textInputMode === "chord") {
      // Position above the note (where chord symbols render)
      positionStyle = {
        position: "fixed",
        left: `${containerRect.left + notePosition.x}px`,
        top: `${containerRect.top + notePosition.y - 8}px`,
        transform: "translate(-50%, -100%)",
        zIndex: 1000,
      };
    } else {
      // Position below the note (where lyrics render)
      positionStyle = {
        position: "fixed",
        left: `${containerRect.left + notePosition.x}px`,
        top: `${containerRect.top + notePosition.y + notePosition.height + 24}px`,
        transform: "translateX(-50%)",
        zIndex: 1000,
      };
    }
  } else {
    positionStyle = {
      position: "fixed",
      bottom: "40px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 1000,
    };
  }

  return (
    <div style={positionStyle}>
      <div className="flex items-center gap-2 bg-popover border-2 border-primary rounded-md px-3 py-1.5 shadow-lg">
        <span className="font-semibold text-sm text-primary">{label}</span>
        <Input
          ref={inputRef}
          type="text"
          className="min-w-[150px] h-7"
          placeholder={textInputMode === "chord" ? "e.g. Cmaj7" : "e.g. hel-"}
          onKeyDown={handleKeyDown}
          onBlur={() => cancelTextInput()}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {textInputMode === "chord" ? "Enter to set, Esc to cancel" : "Enter to advance, Esc to exit"}
        </span>
      </div>
    </div>
  );
}
