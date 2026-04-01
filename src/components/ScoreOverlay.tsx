import { useState, useCallback, useRef, useEffect } from "react";
import { useEditorStore } from "../state";
import type { CursorPosition } from "../input/InputState";
import type { Selection } from "../plugins/PluginAPI";

const HIT_PADDING = 8; // extra pixels around text for easier clicking

interface Props {
  width: number;
  height: number;
}

export function ScoreOverlay({ width, height }: Props) {
  const score = useEditorStore((s) => s.score);
  const noteBoxes = useEditorStore((s) => s.noteBoxes);
  const annotationBoxes = useEditorStore((s) => s.annotationBoxes);
  const measurePositions = useEditorStore((s) => s.measurePositions);
  const titlePositions = useEditorStore((s) => s.titlePositions);
  const editingTitle = useEditorStore((s) => s.editingTitle);
  const editingComposer = useEditorStore((s) => s.editingComposer);
  const setEditingTitle = useEditorStore((s) => s.setEditingTitle);
  const setEditingComposer = useEditorStore((s) => s.setEditingComposer);
  const setCursorDirect = useEditorStore((s) => s.setCursorDirect);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setNoteSelection = useEditorStore((s) => s.setNoteSelection);
  const editAnnotation = useEditorStore((s) => s.editAnnotation);
  const setTitle = useEditorStore((s) => s.setTitle);
  const setComposer = useEditorStore((s) => s.setComposer);
  const showTitle = useEditorStore((s) => s.showTitle);
  const showComposer = useEditorStore((s) => s.showComposer);

  const [titleValue, setTitleValue] = useState("");
  const [composerValue, setComposerValue] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  // Selection anchors
  const anchorRef = useRef<{ partIndex: number; measureIndex: number } | null>(null);
  const noteAnchorRef = useRef<{ partIndex: number; measureIndex: number; voiceIndex: number; eventIndex: number } | null>(null);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (editingComposer) composerRef.current?.focus();
  }, [editingComposer]);

  const titleRect = titlePositions.title;
  const composerRect = titlePositions.composer;

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;

    // Title click-to-edit
    if (showTitle && titleRect) {
      const r = titleRect;
      if (x >= r.x - HIT_PADDING && x <= r.x + r.width + HIT_PADDING &&
          y >= r.y - HIT_PADDING && y <= r.y + r.height + HIT_PADDING) {
        setTitleValue(score.title);
        setEditingTitle(true);
        return;
      }
    }

    // Composer click-to-edit
    if (showTitle && showComposer && composerRect) {
      const r = composerRect;
      if (x >= r.x - HIT_PADDING && x <= r.x + r.width + HIT_PADDING &&
          y >= r.y - HIT_PADDING && y <= r.y + r.height + HIT_PADDING) {
        setComposerValue(score.composer);
        setEditingComposer(true);
        return;
      }
    }

    // Click on annotation (chord symbol or lyric) — edit it
    for (const ab of annotationBoxes) {
      if (x >= ab.x - HIT_PADDING && x <= ab.x + ab.width + HIT_PADDING &&
          y >= ab.y - HIT_PADDING && y <= ab.y + ab.height + HIT_PADDING) {
        editAnnotation(ab);
        return;
      }
    }

    // Click on a note — move cursor there
    for (const [, nb] of noteBoxes) {
      if (x >= nb.x && x <= nb.x + nb.width && y >= nb.y && y <= nb.y + nb.height) {
        const cursor: CursorPosition = {
          partIndex: nb.partIndex,
          measureIndex: nb.measureIndex,
          voiceIndex: nb.voiceIndex,
          eventIndex: nb.eventIndex,
        };
        setCursorDirect(cursor);

        if (e.shiftKey && noteAnchorRef.current &&
            noteAnchorRef.current.partIndex === nb.partIndex &&
            noteAnchorRef.current.measureIndex === nb.measureIndex &&
            noteAnchorRef.current.voiceIndex === nb.voiceIndex) {
          // Note-level selection within same measure/voice
          setNoteSelection({
            partIndex: nb.partIndex,
            measureIndex: nb.measureIndex,
            voiceIndex: nb.voiceIndex,
            startEvent: Math.min(noteAnchorRef.current.eventIndex, nb.eventIndex),
            endEvent: Math.max(noteAnchorRef.current.eventIndex, nb.eventIndex),
          });
        } else if (e.shiftKey && anchorRef.current) {
          // Measure-level selection across measures
          setSelection({
            partIndex: nb.partIndex,
            measureStart: Math.min(anchorRef.current.measureIndex, nb.measureIndex),
            measureEnd: Math.max(anchorRef.current.measureIndex, nb.measureIndex),
          });
        } else {
          noteAnchorRef.current = { partIndex: nb.partIndex, measureIndex: nb.measureIndex, voiceIndex: nb.voiceIndex, eventIndex: nb.eventIndex };
          anchorRef.current = { partIndex: nb.partIndex, measureIndex: nb.measureIndex };
          setSelection(null);
        }
        return;
      }
    }

    // Click on measure — move cursor to measure start, preserve current voice
    const currentVoice = useEditorStore.getState().inputState.cursor.voiceIndex;
    for (const mp of measurePositions) {
      if (x >= mp.x && x <= mp.x + mp.width && y >= mp.y && y <= mp.y + mp.height) {
        setCursorDirect({
          partIndex: mp.partIndex,
          measureIndex: mp.measureIndex,
          voiceIndex: currentVoice,
          eventIndex: 0,
        });

        if (e.shiftKey && anchorRef.current) {
          setSelection({
            partIndex: mp.partIndex,
            measureStart: Math.min(anchorRef.current.measureIndex, mp.measureIndex),
            measureEnd: Math.max(anchorRef.current.measureIndex, mp.measureIndex),
          });
        } else {
          anchorRef.current = { partIndex: mp.partIndex, measureIndex: mp.measureIndex };
          setSelection(null);
        }
        return;
      }
    }
  }, [noteBoxes, annotationBoxes, measurePositions, score, width, titleRect, composerRect, setCursorDirect, setSelection, setNoteSelection, editAnnotation, setEditingTitle, setEditingComposer, showTitle, showComposer]);

  const commitTitle = useCallback(() => {
    setTitle(titleValue);
    setEditingTitle(false);
  }, [titleValue, setTitle, setEditingTitle]);

  const commitComposer = useCallback(() => {
    setComposer(composerValue);
    setEditingComposer(false);
  }, [composerValue, setComposer, setEditingComposer]);

  return (
    <div
      onClick={handleClick}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        cursor: "default",
      }}
    >
      {showTitle && editingTitle && titleRect && (
        <input
          ref={titleRef}
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTitle();
            if (e.key === "Escape") setEditingTitle(false);
          }}
          style={{
            position: "absolute",
            top: titleRect.y - 6,
            left: titleRect.x - 16,
            width: titleRect.width + 32,
            textAlign: "center",
            font: "bold 28px system-ui, -apple-system, 'Segoe UI', sans-serif",
            color: "#000",
            background: "transparent",
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 4,
            outline: "none",
            padding: "4px 16px",
            boxSizing: "border-box" as const,
          }}
        />
      )}

      {showTitle && showComposer && editingComposer && composerRect && (
        <input
          ref={composerRef}
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onBlur={commitComposer}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitComposer();
            if (e.key === "Escape") setEditingComposer(false);
          }}
          style={{
            position: "absolute",
            top: composerRect.y - 6,
            left: composerRect.x - 16,
            width: composerRect.width + 32,
            textAlign: "center",
            font: "italic 15px system-ui, -apple-system, 'Segoe UI', sans-serif",
            color: "#000",
            background: "transparent",
            border: "1px solid rgba(0,0,0,0.2)",
            borderRadius: 4,
            outline: "none",
            padding: "4px 16px",
            boxSizing: "border-box" as const,
          }}
        />
      )}
    </div>
  );
}
