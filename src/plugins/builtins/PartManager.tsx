import { useState, useRef, useCallback } from "react";
import type { PluginManager } from "../PluginManager";
import { useEditorStore } from "../../state";
import { INSTRUMENTS } from "../../model/instruments";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

function PartsPanel() {
  const score = useEditorStore((s) => s.score);
  const cursorPartIndex = useEditorStore((s) => s.inputState.cursor.partIndex);
  const addPart = useEditorStore((s) => s.addPart);
  const removePart = useEditorStore((s) => s.removePart);
  const reorderPart = useEditorStore((s) => s.reorderPart);
  const toggleSolo = useEditorStore((s) => s.toggleSolo);
  const toggleMute = useEditorStore((s) => s.toggleMute);
  const togglePartVisibility = useEditorStore((s) => s.togglePartVisibility);
  const hiddenParts = useEditorStore((s) => s.hiddenParts);
  const moveCursorToPart = useEditorStore((s) => s.moveCursorToPart);

  const [selectedInstrument, setSelectedInstrument] = useState("piano");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDragIndex(null);
    setDropTarget(null);
    dragCounter.current = 0;
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragIndex !== null && index !== dragIndex) {
      setDropTarget(index);
    }
  }, [dragIndex]);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDropTarget(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    dragCounter.current = 0;
    if (dragIndex === null || dragIndex === toIndex) return;

    // Move step by step to the target position
    let current = dragIndex;
    while (current < toIndex) {
      reorderPart(current, "down");
      current++;
    }
    while (current > toIndex) {
      reorderPart(current, "up");
      current--;
    }

    setDragIndex(null);
    setDropTarget(null);
  }, [dragIndex, reorderPart]);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {score.parts.map((part, index) => (
          <div
            key={part.id}
            draggable={score.parts.length > 1}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className={cn(
              "px-2 py-1.5 border-b cursor-pointer text-[11px] transition-colors",
              index === cursorPartIndex ? "bg-accent" : "hover:bg-accent/50",
              dropTarget === index && dragIndex !== null && index !== dragIndex && "border-t-2 border-t-primary"
            )}
            onClick={() => moveCursorToPart(index)}
          >
            <div className="flex gap-1 items-center">
              <div className="p-0.5 flex-shrink-0 cursor-grab">
                <GripVertical className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="font-semibold text-[11px] leading-none">{part.name}</span>
              <div className="flex-1" />
              <div className="flex gap-0.5">
                <Button
                  variant={hiddenParts.has(index) ? "default" : "outline"}
                  className={cn("h-5 w-5 min-w-0 p-0 rounded [&_svg]:size-3", hiddenParts.has(index) && "bg-muted text-muted-foreground")}
                  onClick={(e) => { e.stopPropagation(); togglePartVisibility(index); }}
                  disabled={score.parts.length <= 1}
                  title={hiddenParts.has(index) ? "Show Part" : "Hide Part"}
                >{hiddenParts.has(index) ? (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4 8 11 8 11-8 11-8" />
                    <line x1="5" y1="16" x2="4" y2="19" />
                    <line x1="12" y1="18" x2="12" y2="21" />
                    <line x1="19" y1="16" x2="20" y2="19" />
                  </svg>
                ) : (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}</Button>
                <Button
                  variant={part.solo ? "default" : "outline"}
                  className={cn("h-5 w-5 min-w-0 p-0 rounded text-[10px] font-bold", part.solo && "bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-600")}
                  onClick={(e) => { e.stopPropagation(); toggleSolo(index); }}
                  title="Solo"
                >S</Button>
                <Button
                  variant={part.muted ? "default" : "outline"}
                  className={cn("h-5 w-5 min-w-0 p-0 rounded text-[10px] font-bold", part.muted && "bg-red-500 hover:bg-red-600 text-white border-red-600")}
                  onClick={(e) => { e.stopPropagation(); toggleMute(index); }}
                  title="Mute"
                >M</Button>
                <Button variant="outline" className="h-5 w-5 min-w-0 p-0 rounded text-[10px] leading-none" onClick={(e) => { e.stopPropagation(); removePart(index); }} disabled={score.parts.length <= 1} title="Remove Part">&#x2715;</Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-2 border-t">
        <select
          value={selectedInstrument}
          onChange={(e) => setSelectedInstrument(e.target.value)}
          className="flex-1 h-7 text-[11px] rounded border border-input bg-background px-1.5"
        >
          {INSTRUMENTS.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
        <Button variant="outline" className="h-7 text-[11px] px-2 rounded" onClick={() => addPart(selectedInstrument)}>
          Add Part
        </Button>
      </div>
    </div>
  );
}

/** Register core part management panel and commands. Not a plugin — always active. */
export function registerCorePartManager(pm: PluginManager): void {
  pm.registerCorePanel("parts.panel", { title: "Parts", location: "sidebar-left", component: () => <PartsPanel />, defaultEnabled: true });
  pm.registerCoreCommand("nubium.add-part", "Add Part", () => { useEditorStore.getState().addPart("piano"); });
}
