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
  }, [noteBoxes, annotationBoxes, measurePositions, score, width, titleRect, composerRect, setCursorDirect, setSelection, setNoteSelection, editAnnotation, setEditingTitle, setEditingComposer]);

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
      {titleRect && (
        editingTitle ? (
          <input
            ref={titleRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") setEditingTitle(false);
              if (e.key === "Tab") { e.preventDefault(); commitTitle(); setComposerValue(score.composer); setEditingComposer(true); }
            }}
            placeholder="Title"
            style={{
              position: "absolute",
              top: titleRect.y,
              left: titleRect.x,
              width: titleRect.width,
              textAlign: "center",
              font: "bold 28px system-ui, -apple-system, 'Segoe UI', sans-serif",
              color: "#000",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: "2px 8px",
              boxSizing: "border-box" as const,
            }}
          />
        ) : (
          <div
            onClick={() => { setTitleValue(score.title); setEditingTitle(true); }}
            style={{
              position: "absolute",
              top: titleRect.y,
              left: titleRect.x,
              width: titleRect.width,
              textAlign: "center",
              font: "bold 28px system-ui, -apple-system, 'Segoe UI', sans-serif",
              color: score.title ? "#000" : "transparent",
              cursor: "text",
              padding: "2px 8px",
              boxSizing: "border-box" as const,
            }}
          >
            {score.title || "\u00A0"}
          </div>
        )
      )}

      {composerRect && (
        editingComposer ? (
          <input
            ref={composerRef}
            value={composerValue}
            onChange={(e) => setComposerValue(e.target.value)}
            onBlur={commitComposer}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitComposer();
              if (e.key === "Escape") setEditingComposer(false);
            }}
            placeholder="Composer"
            style={{
              position: "absolute",
              top: composerRect.y,
              left: composerRect.x,
              width: composerRect.width,
              textAlign: "center",
              font: "italic 15px system-ui, -apple-system, 'Segoe UI', sans-serif",
              color: "#555",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: "2px 8px",
              boxSizing: "border-box" as const,
            }}
          />
        ) : (
          <div
            onClick={() => { setComposerValue(score.composer); setEditingComposer(true); }}
            style={{
              position: "absolute",
              top: composerRect.y,
              left: composerRect.x,
              width: composerRect.width,
              textAlign: "center",
              font: "italic 15px system-ui, -apple-system, 'Segoe UI', sans-serif",
              color: score.composer ? "#555" : "transparent",
              cursor: "text",
              padding: "2px 8px",
              boxSizing: "border-box" as const,
            }}
          >
            {score.composer || "\u00A0"}
          </div>
        )
      )}
    </div>
  );
}
