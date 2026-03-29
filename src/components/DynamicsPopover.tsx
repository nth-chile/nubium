import { useEffect, useRef } from "react";
import { useEditorStore } from "../state";
import type { DynamicLevel } from "../model/annotations";

const LEVELS: DynamicLevel[] = ["pp", "p", "mp", "mf", "f", "ff", "sfz", "fp"];

export function DynamicsPopover() {
  const open = useEditorStore((s) => s.dynamicsPopoverOpen);
  const setOpen = useEditorStore((s) => s.setDynamicsPopoverOpen);
  const setDynamic = useEditorStore((s) => s.setDynamic);
  const noteBoxes = useEditorStore((s) => s.noteBoxes);
  const cursor = useEditorStore((s) => s.inputState.cursor);
  const score = useEditorStore((s) => s.score);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [open, setOpen]);

  if (!open) return null;

  // Position near the cursor's note box
  const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  const evt = voice?.events[cursor.eventIndex];
  const box = evt ? noteBoxes.get(evt.id) : null;

  const style: React.CSSProperties = {
    position: "absolute",
    zIndex: 50,
    top: box ? box.y + box.height + 8 : 100,
    left: box ? box.x : 100,
  };

  return (
    <div ref={ref} style={style} className="bg-popover border rounded-lg shadow-lg p-1 flex gap-0.5">
      {LEVELS.map((level) => (
        <button
          key={level}
          onClick={() => setDynamic(level)}
          className="px-2 py-1 text-sm font-serif italic hover:bg-accent rounded min-w-[32px]"
        >
          {level}
        </button>
      ))}
    </div>
  );
}
