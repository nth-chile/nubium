import { useRef, useEffect, useMemo, useState } from "react";
import { useEditorStore } from "../state";
import { Input } from "./ui/input";

export function TextInput() {
  const textInputMode = useEditorStore((s) => s.inputState.textInputMode);
  const textInputInitialValue = useEditorStore((s) => s.inputState.textInputInitialValue);
  const lyricVerse = useEditorStore((s) => s.inputState.lyricVerse);
  const commitTextInput = useEditorStore((s) => s.commitTextInput);
  const cancelTextInput = useEditorStore((s) => s.cancelTextInput);
  const setLyricVerse = useEditorStore((s) => s.setLyricVerse);
  const cursor = useEditorStore((s) => s.inputState.cursor);
  const noteBoxes = useEditorStore((s) => s.noteBoxes);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (textInputMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.value = textInputInitialValue || "";
      if (textInputInitialValue) {
        inputRef.current.select();
      }
    }
  }, [textInputMode, textInputInitialValue, cursor.measureIndex, cursor.eventIndex, lyricVerse]);

  // Track scroll offset of the score container so the input follows the note
  useEffect(() => {
    if (!textInputMode) return;
    const container = document.querySelector("[data-score-container]");
    if (!container) return;

    const updateScroll = () => {
      setScrollOffset({ x: container.scrollLeft, y: container.scrollTop });
    };
    updateScroll();
    container.addEventListener("scroll", updateScroll, { passive: true });
    return () => container.removeEventListener("scroll", updateScroll);
  }, [textInputMode]);

  // Click-outside handler: dismiss when clicking outside the input wrapper
  // This replaces onBlur which was too aggressive (fired on scrollbar clicks, etc.)
  useEffect(() => {
    if (!textInputMode) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        cancelTextInput();
      }
    };

    // Use a microtask delay so the opening click doesn't immediately close it
    const id = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [textInputMode, cancelTextInput]);

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

  const label = textInputMode === "chord" ? "Chord:" : lyricVerse > 1 ? `Lyric v${lyricVerse}:` : "Lyric:";

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTextInput(inputRef.current?.value ?? "");
      if (inputRef.current) inputRef.current.value = "";
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelTextInput();
    } else if (textInputMode === "lyric" && e.key === "ArrowDown") {
      e.preventDefault();
      setLyricVerse(lyricVerse + 1);
    } else if (textInputMode === "lyric" && e.key === "ArrowUp") {
      e.preventDefault();
      if (lyricVerse > 1) setLyricVerse(lyricVerse - 1);
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      useEditorStore.getState().undo();
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      useEditorStore.getState().redo();
    }
  }

  // Position near the note, accounting for container scroll
  const scoreContainer = document.querySelector("[data-score-container]");
  const containerRect = scoreContainer?.getBoundingClientRect();

  let positionStyle: React.CSSProperties;
  if (notePosition && containerRect) {
    // notePosition is in canvas coordinates; subtract scroll to get viewport-relative
    const viewX = containerRect.left + notePosition.x - scrollOffset.x;
    const viewY = containerRect.top + notePosition.y - scrollOffset.y;

    if (textInputMode === "chord") {
      positionStyle = {
        position: "fixed",
        left: `${viewX}px`,
        top: `${viewY - 8}px`,
        transform: "translate(-50%, -100%)",
        zIndex: 1000,
      };
    } else {
      positionStyle = {
        position: "fixed",
        left: `${viewX}px`,
        top: `${viewY + notePosition.height + 24}px`,
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
    <div ref={wrapperRef} style={positionStyle}>
      <div className="flex items-center gap-2 bg-popover border-2 border-primary rounded-md px-3 py-1.5 shadow-lg whitespace-nowrap">
        <span className="font-semibold text-sm text-primary">{label}</span>
        <Input
          ref={inputRef}
          type="text"
          className="min-w-[150px] h-7"
          placeholder={textInputMode === "chord" ? "e.g. Cmaj7" : "e.g. hel-"}
          onKeyDown={handleKeyDown}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {textInputMode === "chord" ? "Enter to set, Esc to cancel" : "Enter to advance, Esc to exit"}
        </span>
      </div>
    </div>
  );
}
