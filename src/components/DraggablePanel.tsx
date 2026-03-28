import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLayoutStore } from "../state/LayoutState";

interface DraggablePanelProps {
  id: string;
  title: string;
  children: React.ReactNode;
  isOverlay?: boolean;
}

export function DraggablePanel({ id, title, children, isOverlay }: DraggablePanelProps) {
  const collapsed = useLayoutStore((s) => s.panelCollapsed[id] ?? false);
  const toggleCollapsed = useLayoutStore((s) => s.togglePanelCollapsed);

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
    opacity: isDragging ? 0.4 : 1,
    marginBottom: 4,
    borderRadius: 6,
    border: "1px solid #e2e8f0",
    background: "#fff",
    boxShadow: isOverlay ? "0 4px 16px rgba(0,0,0,0.15)" : "none",
    overflow: "hidden",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>

        <button
          onClick={() => toggleCollapsed(id)}
          style={styles.collapseButton}
          title={collapsed ? "Expand panel" : "Collapse panel"}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="#64748b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          >
            <polyline points="2,4 6,8 10,4" />
          </svg>
        </button>

        {/* Drag handle on the right */}
        <div style={styles.dragHandle} {...listeners} title="Drag to reorder">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="#94a3b8">
            <circle cx="2" cy="2" r="1.5" />
            <circle cx="8" cy="2" r="1.5" />
            <circle cx="2" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="2" cy="14" r="1.5" />
            <circle cx="8" cy="14" r="1.5" />
          </svg>
        </div>
      </div>

      {!collapsed && (
        <div style={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    cursor: "default",
    userSelect: "none",
  },
  dragHandle: {
    cursor: "grab",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 2px",
    borderRadius: 3,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: 600,
    color: "#334155",
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  collapseButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 3,
    flexShrink: 0,
  },
  content: {
    overflow: "auto",
  },
};
