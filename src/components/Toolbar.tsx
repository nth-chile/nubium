import React, { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEditorStore } from "../state";
import { useLayoutStore } from "../state/LayoutState";
import { useHotkey } from "../hooks/useHotkey";
import { TooltipButton } from "./ui/tooltip-button";
import { Separator } from "./ui/separator";
import { PanelLeft, PanelRight, Undo2, Redo2, Settings, Puzzle } from "lucide-react";
import { ContextMenu, ContextMenuCheckbox, ContextMenuSeparator, ContextMenuItem, ContextMenuLabel } from "./ui/context-menu";
import { cn } from "@/lib/utils";
import type { PanelRegistration } from "../plugins/PluginManager";
/** A toolbar group definition */
export interface ToolbarGroup {
  id: string;
  label: string;
  /** Which toolbar row this group defaults to */
  defaultRow: "primary" | "secondary";
  component: () => React.ReactNode;
}

interface ToolbarProps {
  onToggleSettings?: () => void;
  onTogglePlugins?: () => void;
  onNew?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  toolbarPanels?: PanelRegistration[];
}

/** Scrollable container with fade edges when content overflows */
function ScrollFade({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<"none" | "left" | "right" | "both">("none");

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const canLeft = scrollLeft > 1;
    const canRight = scrollLeft < scrollWidth - clientWidth - 1;
    setFade(canLeft && canRight ? "both" : canLeft ? "left" : canRight ? "right" : "none");
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [update]);

  const maskImage =
    fade === "both" ? "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)" :
    fade === "left" ? "linear-gradient(to right, transparent, black 24px)" :
    fade === "right" ? "linear-gradient(to right, black calc(100% - 24px), transparent)" :
    undefined;

  return (
    <div
      ref={ref}
      className={cn("overflow-x-auto scrollbar-none min-w-0", className)}
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      {children}
    </div>
  );
}

/** A single sortable group in a toolbar row */
function SortableToolbarGroup({ group, isOverlay }: { group: ToolbarGroup; isOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "flex items-center gap-1 rounded px-1 cursor-grab",
        isDragging && "opacity-40",
        isOverlay && "bg-popover shadow-lg border rounded-md px-2 py-1"
      )}
    >
      {group.component()}
    </div>
  );
}

/** Resolves which groups appear in a given row, respecting persisted order */
function useToolbarRow(
  row: "primary" | "secondary",
  allGroups: ToolbarGroup[],
) {
  const toolbarOrder = useLayoutStore((s) => s.toolbarOrder);
  const toolbarHidden = useLayoutStore((s) => s.toolbarHidden);

  return useMemo(() => {
    const persistedRow = toolbarOrder[row];
    const assigned = new Set(persistedRow);
    const otherRow = row === "primary" ? "secondary" : "primary";
    const assignedOther = new Set(toolbarOrder[otherRow]);

    const ordered: ToolbarGroup[] = [];
    const seen = new Set<string>();

    for (const id of persistedRow) {
      const g = allGroups.find((g) => g.id === id);
      if (g) {
        ordered.push(g);
        seen.add(id);
      }
    }

    for (const g of allGroups) {
      if (!seen.has(g.id) && !assigned.has(g.id) && !assignedOther.has(g.id) && g.defaultRow === row) {
        ordered.push(g);
      }
    }

    const visible = ordered.filter((g) => !toolbarHidden.includes(g.id));
    return { ordered, visible };
  }, [row, allGroups, toolbarOrder, toolbarHidden]);
}

export function Toolbar({ onToggleSettings, onTogglePlugins, onNew, onOpen, onSave, toolbarPanels = [] }: ToolbarProps) {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const hotkey = useHotkey();

  const panels = useLayoutStore((s) => s.panels);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toolbarHidden = useLayoutStore((s) => s.toolbarHidden);
  const toolbarOrder = useLayoutStore((s) => s.toolbarOrder);
  const toggleToolbarGroup = useLayoutStore((s) => s.toggleToolbarGroup);
  const setToolbarOrder = useLayoutStore((s) => s.setToolbarOrder);
  const moveToolbarGroup = useLayoutStore((s) => s.moveToolbarGroup);
  const resetToolbar = useLayoutStore((s) => s.resetToolbar);
  const hasLeftPanels = panels.left.length > 0;
  const hasRightPanels = panels.right.length > 0;

  // Refs for measuring row positions during drag
  const primaryRowRef = useRef<HTMLDivElement>(null);
  const secondaryRowRef = useRef<HTMLDivElement>(null);

  const allGroups: ToolbarGroup[] = useMemo(() => {
    const groups: ToolbarGroup[] = [];
    for (const panel of toolbarPanels) {
      groups.push({
        id: panel.id,
        label: panel.config.title,
        defaultRow: "secondary",
        component: panel.config.component,
      });
    }
    return groups;
  }, [toolbarPanels]);

  const primary = useToolbarRow("primary", allGroups);
  const secondary = useToolbarRow("secondary", allGroups);

  // Map group id → row
  const groupRowMap = useMemo(() => {
    const map = new Map<string, "primary" | "secondary">();
    for (const g of primary.visible) map.set(g.id, "primary");
    for (const g of secondary.visible) map.set(g.id, "secondary");
    return map;
  }, [primary.visible, secondary.visible]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverRow, setHoverRow] = useState<"primary" | "secondary" | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // Determine which row the pointer is over by checking DOM rects
  const getRowAtPoint = useCallback((y: number): "primary" | "secondary" | null => {
    const primaryRect = primaryRowRef.current?.getBoundingClientRect();
    const secondaryRect = secondaryRowRef.current?.getBoundingClientRect();
    if (primaryRect && y >= primaryRect.top && y <= primaryRect.bottom) return "primary";
    if (secondaryRect && y >= secondaryRect.top && y <= secondaryRect.bottom) return "secondary";
    return null;
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setHoverRow(null);

      const activeRow = groupRowMap.get(active.id as string);
      if (!activeRow) return;

      // Use pointer position to determine target row (more reliable than dnd-kit collision)
      const pointerY = (event.activatorEvent as PointerEvent).clientY +
        ((event.delta?.y) ?? 0);
      const targetRow = getRowAtPoint(pointerY);

      if (!targetRow) return;

      if (activeRow !== targetRow) {
        // Cross-row drop
        moveToolbarGroup(active.id as string, targetRow);

        // If dropped on a specific group, insert near it
        const overGroupId = over && groupRowMap.get(over.id as string) === targetRow ? over.id as string : undefined;
        if (overGroupId) {
          const targetGroups = targetRow === "primary" ? primary.visible : secondary.visible;
          const ids = targetGroups.map((g) => g.id).filter((id) => id !== active.id as string);
          const overIndex = ids.indexOf(overGroupId);
          ids.splice(overIndex + 1, 0, active.id as string);
          const hiddenInRow = toolbarOrder[targetRow].filter((id) => toolbarHidden.includes(id));
          setToolbarOrder(targetRow, [...ids, ...hiddenInRow]);
        }
      } else if (over && active.id !== over.id && groupRowMap.has(over.id as string)) {
        // Same-row reorder
        const groups = activeRow === "primary" ? primary.visible : secondary.visible;
        const ids = groups.map((g) => g.id);
        const oldIndex = ids.indexOf(active.id as string);
        const newIndex = ids.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(ids, oldIndex, newIndex);
        const hiddenInRow = toolbarOrder[activeRow].filter((id) => toolbarHidden.includes(id));
        setToolbarOrder(activeRow, [...reordered, ...hiddenInRow]);
      }
    },
    [groupRowMap, primary.visible, secondary.visible, toolbarOrder, toolbarHidden, setToolbarOrder, moveToolbarGroup, getRowAtPoint]
  );

  const activeGroup = activeId ? allGroups.find((g) => g.id === activeId) : null;

  // Track pointer position during drag for row highlighting
  React.useEffect(() => {
    if (!activeId) { setHoverRow(null); return; }
    const handlePointerMove = (e: PointerEvent) => {
      setHoverRow(getRowAtPoint(e.clientY));
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [activeId, getRowAtPoint]);

  const contextMenuContent = (
    <>
      <ContextMenuLabel>Toolbar groups</ContextMenuLabel>
      {allGroups.map((group) => (
        <ContextMenuCheckbox
          key={group.id}
          checked={!toolbarHidden.includes(group.id)}
          onCheckedChange={() => toggleToolbarGroup(group.id)}
        >
          {group.label}
        </ContextMenuCheckbox>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={resetToolbar}>Reset toolbar</ContextMenuItem>
    </>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Primary toolbar — app-level controls */}
      <ContextMenu
        trigger={
          <div
            ref={primaryRowRef}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-2 py-1 border-b bg-card shrink-0",
              activeId && hoverRow === "primary" && "bg-accent/30",
            )}
          >
            {/* Left: file + undo/redo */}
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1">
                {onNew && (
                  <TooltipButton variant="ghost" size="sm" onClick={onNew} tooltip={`New score (${hotkey("file:new")})`} actionId="file:new">
                    New
                  </TooltipButton>
                )}
                {onOpen && (
                  <TooltipButton variant="ghost" size="sm" onClick={onOpen} tooltip={`Open file (${hotkey("file:open")})`} actionId="file:open">
                    Open
                  </TooltipButton>
                )}
                {onSave && (
                  <TooltipButton variant="ghost" size="sm" onClick={onSave} tooltip={`Save file (${hotkey("file:save")})`} actionId="file:save">
                    Save
                  </TooltipButton>
                )}
              </div>

              <Separator orientation="vertical" />

              <div className="flex items-center gap-1">
                <TooltipButton variant="ghost" size="icon" onClick={undo} tooltip={`Undo (${hotkey("undo")})`} actionId="undo">
                  <Undo2 className="h-4 w-4" />
                </TooltipButton>
                <TooltipButton variant="ghost" size="icon" onClick={redo} tooltip={`Redo (${hotkey("redo")})`} actionId="redo">
                  <Redo2 className="h-4 w-4" />
                </TooltipButton>
              </div>
            </div>

            {/* Center: draggable groups (scrolls horizontally with fade edges) */}
            <ScrollFade className="flex items-center gap-1 justify-center">
              <SortableContext items={primary.visible.map((g) => g.id)} strategy={horizontalListSortingStrategy}>
                {primary.visible.map((group, i) => (
                  <React.Fragment key={group.id}>
                    {i > 0 && <Separator orientation="vertical" />}
                    <SortableToolbarGroup group={group} />
                  </React.Fragment>
                ))}
              </SortableContext>
            </ScrollFade>

            {/* Right: plugins + settings */}
            <div className="flex items-center gap-1 justify-end">
              {onTogglePlugins && (
                <TooltipButton variant="ghost" size="icon" onClick={onTogglePlugins} tooltip={`Plugins (${hotkey("toggle-plugins")})`} actionId="toggle-plugins">
                  <Puzzle className="h-4 w-4" />
                </TooltipButton>
              )}

              {onToggleSettings && (
                <TooltipButton variant="ghost" size="icon" onClick={onToggleSettings} tooltip={`Settings (${hotkey("toggle-settings")})`} actionId="toggle-settings">
                  <Settings className="h-4 w-4" />
                </TooltipButton>
              )}
            </div>
          </div>
        }
      >
        {contextMenuContent}
      </ContextMenu>

      {/* Secondary toolbar — sidebar toggles + draggable plugin groups */}
      <ContextMenu
        trigger={
          <div
            ref={secondaryRowRef}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-2 py-1 border-b bg-card/50 shrink-0",
              activeId && hoverRow === "secondary" && "bg-accent/30",
            )}
          >
            {/* Left: sidebar toggle */}
            <div className="flex items-center gap-1">
              {hasLeftPanels && (
                <TooltipButton
                  variant={sidebarOpen.left ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => toggleSidebar("left")}
                  tooltip={`${sidebarOpen.left ? "Hide left sidebar" : "Show left sidebar"} (${hotkey("toggle-left-sidebar")})`}
                  actionId="toggle-left-sidebar"
                >
                  <PanelLeft className="h-4 w-4" />
                </TooltipButton>
              )}
            </div>

            {/* Center: draggable groups (scrolls horizontally with fade edges) */}
            <ScrollFade className="flex items-center gap-1 justify-center">
              <SortableContext items={secondary.visible.map((g) => g.id)} strategy={horizontalListSortingStrategy}>
                {secondary.visible.map((group, i) => (
                  <React.Fragment key={group.id}>
                    {i > 0 && <Separator orientation="vertical" />}
                    <SortableToolbarGroup group={group} />
                  </React.Fragment>
                ))}
              </SortableContext>
            </ScrollFade>

            {/* Right: sidebar toggle */}
            <div className="flex items-center gap-1 justify-end">
              {hasRightPanels && (
                <TooltipButton
                  variant={sidebarOpen.right ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => toggleSidebar("right")}
                  tooltip={`${sidebarOpen.right ? "Hide right sidebar" : "Show right sidebar"} (${hotkey("toggle-right-sidebar")})`}
                  actionId="toggle-right-sidebar"
                >
                  <PanelRight className="h-4 w-4" />
                </TooltipButton>
              )}
            </div>
          </div>
        }
      >
        {contextMenuContent}
      </ContextMenu>

      <DragOverlay>
        {activeGroup ? <SortableToolbarGroup group={activeGroup} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
