import React, { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, DragOverEvent, CollisionDetection } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useLayoutStore, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH } from "../state/LayoutState";
import { DraggablePanel } from "./DraggablePanel";
import type { PanelRegistration } from "../plugins/PluginManager";
import { cn } from "@/lib/utils";

/**
 * Custom collision detection: prioritize sidebar containers when the pointer
 * is over them, then fall back to closestCenter for reordering within a sidebar.
 */
const sidebarAwareCollision: CollisionDetection = (args) => {
  // First check if pointer is within a sidebar droppable
  const pointerCollisions = pointerWithin(args);
  const sidebarHit = pointerCollisions.find(
    (c) => c.id === "left" || c.id === "right"
  );

  if (sidebarHit) {
    // Pointer is over a sidebar — check for sortable items within it too
    const withinSidebar = rectIntersection({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.id === sidebarHit.id || pointerCollisions.some((pc) => pc.id === c.id)
      ),
    });
    if (withinSidebar.length > 0) return withinSidebar;
    return [sidebarHit];
  }

  // Fallback to closestCenter for normal reordering
  return closestCenter(args);
};

interface PanelLayoutProps {
  leftPanels: PanelRegistration[];
  rightPanels: PanelRegistration[];
  children: React.ReactNode;
}

function buildPanelMap(panels: PanelRegistration[]): Map<string, PanelRegistration> {
  const map = new Map<string, PanelRegistration>();
  for (const p of panels) map.set(p.id, p);
  return map;
}

function DroppableSidebar({
  id,
  panelIds,
  panelMap,
  isOpen,
  width,
}: {
  id: string;
  panelIds: string[];
  panelMap: Map<string, PanelRegistration>;
  isOpen: boolean;
  width: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  if (!isOpen) return null;

  return (
    <div
      ref={setNodeRef}
      style={{ width, minWidth: width }}
      className={cn(
        "flex flex-col overflow-y-auto overflow-x-hidden transition-colors",
        id === "left" ? "border-r" : "border-l",
        isOver ? "bg-accent" : "bg-card"
      )}
    >
      <SortableContext items={panelIds} strategy={verticalListSortingStrategy}>
        {panelIds.map((panelId, i) => {
          const reg = panelMap.get(panelId);
          if (!reg) return null;
          return (
            <React.Fragment key={panelId}>
              {i > 0 && <div className="border-t" />}
              <DraggablePanel id={panelId} title={reg.config.title} menuItems={reg.config.menuItems} headerActions={reg.config.headerActions} fill={reg.config.fill}>
                {reg.config.component()}
              </DraggablePanel>
            </React.Fragment>
          );
        })}
      </SortableContext>

      {panelIds.length === 0 && (
        <div className="p-6 text-center text-xs text-muted-foreground border-2 border-dashed m-1">
          Drop panels here
        </div>
      )}
    </div>
  );
}

/**
 * Thin drop zone at window edge — appears during drag when a sidebar is empty/hidden.
 * Dropping a panel here moves it into that sidebar and opens it (VSCode-like behavior).
 */
function EdgeDropZone({ side }: { side: "left" | "right" }) {
  const { setNodeRef, isOver } = useDroppable({ id: side });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-3 shrink-0 transition-all",
        side === "left" ? "border-r" : "border-l",
        isOver ? "w-48 bg-accent border-primary" : "bg-card/50"
      )}
    />
  );
}

const HIDE_THRESHOLD = 100;

function ResizeHandle({ side }: { side: "left" | "right" }) {
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startWidth = useLayoutStore.getState().sidebarWidth[side];

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const adjustedDelta = side === "left" ? delta : -delta;
        const newWidth = Math.min(
          MAX_SIDEBAR_WIDTH,
          Math.max(MIN_SIDEBAR_WIDTH, startWidth + adjustedDelta)
        );
        useLayoutStore.getState().setSidebarWidth(side, newWidth);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        setDragging(false);
        const totalDelta = upEvent.clientX - startX;
        const adjustedDelta = side === "left" ? totalDelta : -totalDelta;
        if (startWidth + adjustedDelta < HIDE_THRESHOLD) {
          useLayoutStore.getState().setSidebarOpen(side, false);
          useLayoutStore.getState().setSidebarWidth(side, DEFAULT_SIDEBAR_WIDTH);
        }
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [side]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "w-1 shrink-0 cursor-col-resize transition-colors hover:bg-primary",
        dragging && "bg-primary"
      )}
    />
  );
}

export function PanelLayout({ leftPanels, rightPanels, children }: PanelLayoutProps) {
  const panels = useLayoutStore((s) => s.panels);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const movePanel = useLayoutStore((s) => s.movePanel);
  const initLayout = useLayoutStore((s) => s.initLayout);

  const [activeId, setActiveId] = useState<string | null>(null);

  const allPanels = [...leftPanels, ...rightPanels];
  const panelMap = buildPanelMap(allPanels);

  useEffect(() => {
    const available = [
      ...leftPanels.map((p) => ({ id: p.id, defaultSidebar: "left" as const })),
      ...rightPanels.map((p) => ({ id: p.id, defaultSidebar: "right" as const })),
    ];
    initLayout(available);
  }, [leftPanels.length, rightPanels.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const findSidebar = useCallback(
    (panelId: string): "left" | "right" | null => {
      if (panels.left.includes(panelId)) return "left";
      if (panels.right.includes(panelId)) return "right";
      return null;
    },
    [panels]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeIdStr = active.id as string;
      const overIdStr = over.id as string;
      const activeSidebar = findSidebar(activeIdStr);

      let overSidebar: "left" | "right" | null = null;
      if (overIdStr === "left" || overIdStr === "right") {
        overSidebar = overIdStr;
      } else {
        overSidebar = findSidebar(overIdStr);
      }

      if (!activeSidebar || !overSidebar || activeSidebar === overSidebar) return;

      const targetList = panels[overSidebar];
      const overIndex = targetList.indexOf(overIdStr);
      const insertIndex = overIndex !== -1 ? overIndex : targetList.length;
      movePanel(activeIdStr, overSidebar, insertIndex);
    },
    [findSidebar, movePanel, panels]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;

      const activeIdStr = active.id as string;
      const overIdStr = over.id as string;

      if (overIdStr === "left" || overIdStr === "right") {
        const currentSidebar = findSidebar(activeIdStr);
        if (currentSidebar !== overIdStr) {
          movePanel(activeIdStr, overIdStr, panels[overIdStr].length);
        }
        // Ensure sidebar is open (handles edge drop zone case)
        useLayoutStore.getState().setSidebarOpen(overIdStr, true);
        return;
      }

      const activeSidebar = findSidebar(activeIdStr);
      const overSidebar = findSidebar(overIdStr);

      if (!activeSidebar || !overSidebar || activeSidebar !== overSidebar) return;

      const list = panels[activeSidebar];
      const oldIndex = list.indexOf(activeIdStr);
      const newIndex = list.indexOf(overIdStr);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(list, oldIndex, newIndex);
        useLayoutStore.setState((state) => {
          const newPanels = { ...state.panels, [activeSidebar]: reordered };
          try {
            localStorage.setItem(
              "notation-panel-layout",
              JSON.stringify({
                panels: newPanels,
                sidebarOpen: state.sidebarOpen,
                panelCollapsed: state.panelCollapsed,
                sidebarWidth: state.sidebarWidth,
              })
            );
          } catch {
            // ignore
          }
          return { panels: newPanels };
        });
      }
    },
    [findSidebar, movePanel, panels]
  );

  const activePanel = activeId ? panelMap.get(activeId) : null;
  const hasLeftPanels = panels.left.length > 0;
  const hasRightPanels = panels.right.length > 0;
  const showLeft = hasLeftPanels && sidebarOpen.left;
  const showRight = hasRightPanels && sidebarOpen.right;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sidebarAwareCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Edge drop zone: appears when dragging and left sidebar is hidden */}
        {!showLeft && activeId && <EdgeDropZone side="left" />}

        <DroppableSidebar
          id="left"
          panelIds={panels.left}
          panelMap={panelMap}
          isOpen={showLeft}
          width={sidebarWidth.left}
        />
        {showLeft && <ResizeHandle side="left" />}

        <div className="flex flex-1 overflow-hidden min-w-0">{children}</div>

        {showRight && <ResizeHandle side="right" />}
        <DroppableSidebar
          id="right"
          panelIds={panels.right}
          panelMap={panelMap}
          isOpen={showRight}
          width={sidebarWidth.right}
        />

        {/* Edge drop zone: appears when dragging and right sidebar is hidden */}
        {!showRight && activeId && <EdgeDropZone side="right" />}
      </div>

      <DragOverlay>
        {activeId && activePanel ? (
          <DraggablePanel id={activeId} title={activePanel.config.title} isOverlay menuItems={activePanel.config.menuItems} headerActions={activePanel.config.headerActions}>
            {activePanel.config.component()}
          </DraggablePanel>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
