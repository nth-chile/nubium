import React, { useState, useRef, useCallback } from "react";
import type { PluginManager } from "../PluginManager";
import { useEditorStore } from "../../state";
import { INSTRUMENTS } from "../../model/instruments";
import { getPartDisplay } from "../../views/ViewMode";
import { getSettings, subscribeSettings } from "../../settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, Trash2 } from "lucide-react";

/** Quarter note icon — filled oval notehead + stem */
function QuarterNoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <ellipse cx="6.5" cy="11" rx="3.5" ry="2.5" fill="currentColor" transform="rotate(-20 6.5 11)" />
      <rect x="8.3" y="2" width="1.6" height="8" fill="currentColor" />
    </svg>
  );
}

/** Slash quarter note icon — diagonal slash notehead + stem */
function SlashNoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <line x1="3" y1="14" x2="9" y2="7" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7.7" y="2" width="1.6" height="6" fill="currentColor" />
    </svg>
  );
}

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

  const viewConfig = useEditorStore((s) => s.viewConfig);
  const toggleNotation = useEditorStore((s) => s.toggleNotation);

  const [displaySettings, setDisplaySettings] = useState(getSettings().display);
  React.useEffect(() => subscribeSettings((s) => setDisplaySettings(s.display)), []);

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
            <div className="flex gap-1 items-start">
              <div className="p-0.5 flex-shrink-0 cursor-grab">
                <GripVertical className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="font-semibold text-[11px] leading-none">{part.name}</span>
              <div className="flex-1" />
              <div className="flex flex-col gap-1 items-end">
                {(() => {
                  const display = getPartDisplay(viewConfig, index);
                  const toggles = [
                    { key: "standard" as const, show: displaySettings.showStandardToggle, active: display.standard, icon: <QuarterNoteIcon className="h-3.5 w-3.5" />, title: "Standard" },
                    { key: "slash" as const, show: displaySettings.showSlashToggle, active: display.slash, icon: <SlashNoteIcon className="h-3.5 w-3.5" />, title: "Slash" },
                    { key: "tab" as const, show: displaySettings.showTabToggle, active: display.tab, icon: <span className="text-[8px] font-bold leading-none">TAB</span>, title: "Tab" },
                  ];
                  const visible = toggles.filter((t) => t.show);
                  if (visible.length <= 1) return null;
                  return (
                    <div className="flex gap-1">
                      {visible.map((t) => (
                        <button
                          key={t.key}
                          className={cn(
                            "flex items-center justify-center h-5 w-5 rounded-sm border border-border",
                            t.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={(e) => { e.stopPropagation(); toggleNotation(t.key, index); }}
                          title={t.title}
                        >
                          {t.icon}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                <div className="flex gap-1">
                  <Button
                    variant={hiddenParts.has(index) ? "default" : "outline"}
                    className={cn("h-5 w-5 min-w-0 p-0 rounded-sm [&_svg]:size-3", hiddenParts.has(index) && "bg-muted text-muted-foreground")}
                    onClick={(e) => { e.stopPropagation(); togglePartVisibility(index); }}
                    disabled={score.parts.length <= 1}
                    title={hiddenParts.has(index) ? "Show Part" : "Hide Part"}
                  >{hiddenParts.has(index) ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4 8 11 8 11-8 11-8" />
                      <line x1="5" y1="16" x2="4" y2="19" />
                      <line x1="12" y1="18" x2="12" y2="21" />
                      <line x1="19" y1="16" x2="20" y2="19" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}</Button>
                  <Button
                    variant={part.solo ? "default" : "outline"}
                    className={cn("h-5 w-5 min-w-0 p-0 rounded-sm text-[9px] font-bold", part.solo && "bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-600")}
                    onClick={(e) => { e.stopPropagation(); toggleSolo(index); }}
                    title="Solo"
                  >S</Button>
                  <Button
                    variant={part.muted ? "default" : "outline"}
                    className={cn("h-5 w-5 min-w-0 p-0 rounded-sm text-[9px] font-bold", part.muted && "bg-red-500 hover:bg-red-600 text-white border-red-600")}
                    onClick={(e) => { e.stopPropagation(); toggleMute(index); }}
                    title="Mute"
                  >M</Button>
                  <Button variant="outline" className="h-5 w-5 min-w-0 p-0 rounded-sm [&_svg]:size-3" onClick={(e) => { e.stopPropagation(); removePart(index); }} disabled={score.parts.length <= 1} title="Remove Part"><Trash2 /></Button>
                </div>
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
