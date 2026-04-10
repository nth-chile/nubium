import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLayoutStore } from "../state/LayoutState";
import { cn } from "@/lib/utils";
import { ChevronDown, GripVertical, MoreVertical } from "lucide-react";

import type { PanelMenuItem, PanelHeaderAction } from "../plugins/PluginAPI";

function PortalMenu({ menuRef, items, onClose, onRefresh }: { menuRef: React.RefObject<HTMLDivElement | null>; items: PanelMenuItem[]; onClose: () => void; onRefresh: () => void }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = menuRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right - 140 });
    }
  }, [menuRef]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuRef, onClose]);

  return (
    <div
      ref={portalRef}
      className="fixed bg-popover border rounded-md shadow-md z-[9999] py-1 min-w-[140px]"
      style={{ top: pos.top, left: pos.left }}
    >
      {items.map((item) => {
        const isToggle = item.checked !== undefined;
        const Icon = item.icon;
        return (
          <React.Fragment key={item.label}>
            {item.separator && <div className="border-t my-1" />}
            <button
              onClick={() => {
                item.onClick();
                if (isToggle) onRefresh();
                else onClose();
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent cursor-pointer flex items-center gap-2"
            >
              {isToggle ? (
                <span className="w-3 text-[10px]">{item.checked ? "✓" : ""}</span>
              ) : Icon ? (
                <Icon className="h-3 w-3 text-muted-foreground" />
              ) : null}
              <span>{item.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface DraggablePanelProps {
  id: string;
  title: string;
  children: React.ReactNode;
  isOverlay?: boolean;
  menuItems?: PanelMenuItem[] | (() => PanelMenuItem[]);
  headerActions?: PanelHeaderAction[] | (() => PanelHeaderAction[]);
  fill?: boolean;
}

export function DraggablePanel({ id, title, children, isOverlay, menuItems, headerActions, fill }: DraggablePanelProps) {
  const collapsed = useLayoutStore((s) => s.panelCollapsed[id] ?? false);
  const toggleCollapsed = useLayoutStore((s) => s.togglePanelCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuVersion, setMenuVersion] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const resolvedMenuItems = typeof menuItems === "function" ? menuItems() : menuItems;
  const resolvedHeaderActions = typeof headerActions === "function" ? headerActions() : headerActions;
  void menuVersion; // used to trigger re-resolve of function menuItems

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-background overflow-hidden flex flex-col shrink-0",
        fill && !collapsed && "flex-1 min-h-[60px]",
        isDragging && "opacity-40",
        isOverlay && "shadow-lg border rounded-md"
      )}
      {...attributes}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 bg-card select-none">
        <div className="cursor-grab p-0.5 rounded-sm hover:bg-accent" {...listeners} title="Drag to reorder">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>

        <span
          className="flex-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate cursor-pointer"
          onClick={() => toggleCollapsed(id)}
        >
          {title}
        </span>

        <button
          onClick={() => toggleCollapsed(id)}
          className="p-1 rounded-sm hover:bg-accent cursor-pointer"
          title={collapsed ? "Expand panel" : "Collapse panel"}
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform duration-150",
              collapsed && "-rotate-90"
            )}
          />
        </button>

        {resolvedHeaderActions && resolvedHeaderActions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <button
              key={action.title}
              onClick={action.onClick}
              className="p-1 rounded-sm hover:bg-accent cursor-pointer"
              title={action.title}
            >
              <ActionIcon className="h-3 w-3 text-muted-foreground" />
            </button>
          );
        })}

        {resolvedMenuItems && resolvedMenuItems.length > 0 && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded-sm hover:bg-accent cursor-pointer"
              title="Panel options"
            >
              <MoreVertical className="h-3 w-3 text-muted-foreground" />
            </button>
            {menuOpen && createPortal(
              <PortalMenu
                menuRef={menuRef}
                items={resolvedMenuItems}
                onClose={() => setMenuOpen(false)}
                onRefresh={() => setMenuVersion((v) => v + 1)}
              />,
              document.body,
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className={cn("overflow-auto", fill && "flex-1 min-h-0")}>
          {children}
        </div>
      )}
    </div>
  );
}
