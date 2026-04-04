import { useState } from "react";
import type { PluginManager } from "../PluginManager";
import { useEditorStore } from "../../state";
import { INSTRUMENTS } from "../../model/instruments";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {score.parts.map((part, index) => (
          <div
            key={part.id}
            className={cn(
              "px-2 py-1.5 border-b cursor-pointer text-[11px]",
              index === cursorPartIndex ? "bg-accent" : "hover:bg-accent/50"
            )}
            onClick={() => moveCursorToPart(index)}
          >
            <div className="flex gap-1 items-baseline mb-1">
              <span className="font-semibold text-[11px]">{part.name}</span>
              <span className="text-[10px] text-muted-foreground">({part.abbreviation})</span>
            </div>
            <div className="flex gap-0.5">
              <Button
                variant={hiddenParts.has(index) ? "default" : "outline"}
                size="sm"
                className={cn("h-7 w-7 p-0", hiddenParts.has(index) && "bg-muted text-muted-foreground")}
                onClick={(e) => { e.stopPropagation(); togglePartVisibility(index); }}
                disabled={score.parts.length <= 1}
                title={hiddenParts.has(index) ? "Show Part" : "Hide Part"}
              >{hiddenParts.has(index) ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4 8 11 8 11-8 11-8" />
                  <line x1="5" y1="16" x2="4" y2="19" />
                  <line x1="12" y1="18" x2="12" y2="21" />
                  <line x1="19" y1="16" x2="20" y2="19" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}</Button>
              <Button
                variant={part.solo ? "default" : "outline"}
                size="sm"
                className={cn("h-7 w-7 p-0 text-[11px] font-bold", part.solo && "bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-600")}
                onClick={(e) => { e.stopPropagation(); toggleSolo(index); }}
                title="Solo"
              >S</Button>
              <Button
                variant={part.muted ? "default" : "outline"}
                size="sm"
                className={cn("h-7 w-7 p-0 text-[11px] font-bold", part.muted && "bg-red-500 hover:bg-red-600 text-white border-red-600")}
                onClick={(e) => { e.stopPropagation(); toggleMute(index); }}
                title="Mute"
              >M</Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-[13px]" onClick={(e) => { e.stopPropagation(); reorderPart(index, "up"); }} disabled={index === 0} title="Move Up">&uarr;</Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-[13px]" onClick={(e) => { e.stopPropagation(); reorderPart(index, "down"); }} disabled={index === score.parts.length - 1} title="Move Down">&darr;</Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-[14px]" onClick={(e) => { e.stopPropagation(); removePart(index); }} disabled={score.parts.length <= 1} title="Remove Part">&times;</Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-2 border-t">
        <select
          value={selectedInstrument}
          onChange={(e) => setSelectedInstrument(e.target.value)}
          className="flex-1 h-6 text-[10px] rounded border border-input bg-background px-1"
        >
          {INSTRUMENTS.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => addPart(selectedInstrument)}>
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
