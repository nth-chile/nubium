import { useState, useCallback, useRef, useEffect } from "react";
import { useEditorStore } from "../state";
import type { NoteBox } from "../renderer/vexBridge";

const HIT_PADDING = 8; // extra pixels around text for easier clicking

interface Props {
  width: number;
  height: number;
}

export function ScoreOverlay({ width, height }: Props) {
  const score = useEditorStore((s) => s.score);
  const noteBoxes = useEditorStore((s) => s.noteBoxes);
  const hitBoxes = useEditorStore((s) => s.hitBoxes);
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

  // --- Drag-to-select state ---
  const dragRef = useRef<{
    active: boolean;
    directNoteHit: boolean;
    startX: number;
    startY: number;
    anchor: { partIndex: number; measureIndex: number; voiceIndex: number; eventIndex: number; staveIndex?: number };
  } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const DRAG_THRESHOLD = 5; // pixels before a mousedown becomes a drag

  /** Find the note box at (x, y), or null. Uses hitBoxes which includes all staves. */
  const hitTestNote = useCallback((x: number, y: number) => {
    for (const nb of hitBoxes) {
      if (x >= nb.x && x <= nb.x + nb.width && y >= nb.y && y <= nb.y + nb.height) {
        return nb;
      }
    }
    return null;
  }, [hitBoxes]);

  /** Find the nearest note to (x, y) within the same part/voice as the anchor. */
  const findNearestNote = useCallback((x: number, y: number, anchor: { partIndex: number; voiceIndex: number }) => {
    let best: NoteBox | null = null;
    let bestDist = Infinity;
    for (const nb of hitBoxes) {
      if (nb.partIndex !== anchor.partIndex || nb.voiceIndex !== anchor.voiceIndex) continue;
      const cx = nb.headX + nb.headWidth / 2;
      const cy = nb.y + nb.height / 2;
      const dist = Math.abs(x - cx) + Math.abs(y - cy) * 0.3; // weight X more than Y
      if (dist < bestDist) { bestDist = dist; best = nb; }
    }
    return best;
  }, [hitBoxes]);

  const toCanvasCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    const el = overlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left + el.scrollLeft, y: e.clientY - rect.top + el.scrollTop };
  }, []);

  /** Find which measure contains (x, y) and determine part/voice context. */
  const hitTestMeasure = useCallback((x: number, y: number) => {
    for (const mp of measurePositions) {
      if (x >= mp.x && x <= mp.x + mp.width && y >= mp.y && y <= mp.y + mp.height) {
        return mp;
      }
    }
    return null;
  }, [measurePositions]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // left button only
    const { x, y } = toCanvasCoords(e);

    // Direct note hit — use it as anchor
    const nb = hitTestNote(x, y);
    if (nb) {
      dragRef.current = {
        active: false,
        directNoteHit: true,
        startX: x,
        startY: y,
        anchor: { partIndex: nb.partIndex, measureIndex: nb.measureIndex, voiceIndex: nb.voiceIndex, eventIndex: nb.eventIndex, staveIndex: nb.staveIndex },
      };
      return;
    }

    // Clicked on a measure area — find nearest note to use as anchor for drag
    const mp = hitTestMeasure(x, y);
    if (mp) {
      const currentVoice = useEditorStore.getState().inputState.cursor.voiceIndex;
      const nearest = findNearestNote(x, y, { partIndex: mp.partIndex, voiceIndex: currentVoice });
      if (nearest) {
        dragRef.current = {
          active: false,
          directNoteHit: false,
          startX: x,
          startY: y,
          anchor: { partIndex: nearest.partIndex, measureIndex: nearest.measureIndex, voiceIndex: nearest.voiceIndex, eventIndex: nearest.eventIndex, staveIndex: nearest.staveIndex },
        };
      }
    }
  }, [toCanvasCoords, hitTestNote, hitTestMeasure, findNearestNote]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const { x, y } = toCanvasCoords(e);

    // Check if we've exceeded the drag threshold
    if (!drag.active) {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.active = true;
    }

    // Find nearest note in the same voice and update selection
    const nearest = findNearestNote(x, y, drag.anchor);
    if (!nearest) return;

    const anchorPos = drag.anchor.measureIndex * 10000 + drag.anchor.eventIndex;
    const currentPos = nearest.measureIndex * 10000 + nearest.eventIndex;
    const startFirst = anchorPos <= currentPos;

    setNoteSelection({
      partIndex: drag.anchor.partIndex,
      voiceIndex: drag.anchor.voiceIndex,
      startMeasure: startFirst ? drag.anchor.measureIndex : nearest.measureIndex,
      startEvent: startFirst ? drag.anchor.eventIndex : nearest.eventIndex,
      endMeasure: startFirst ? nearest.measureIndex : drag.anchor.measureIndex,
      endEvent: startFirst ? nearest.eventIndex : drag.anchor.eventIndex,
      anchorMeasure: drag.anchor.measureIndex,
      anchorEvent: drag.anchor.eventIndex,
    });
  }, [toCanvasCoords, findNearestNote, setNoteSelection]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;

    // If a drag happened, the selection is already set — just update anchors
    if (drag?.active) {
      noteAnchorRef.current = drag.anchor;
      anchorRef.current = { partIndex: drag.anchor.partIndex, measureIndex: drag.anchor.measureIndex };
      return;
    }

    // No drag — treat as a regular click
    const { x, y } = toCanvasCoords(e);
    const isDoubleClick = e.detail === 2;

    if (isDoubleClick) {
      window.getSelection()?.removeAllRanges();

      // Double-click on a note — select it using anchor from mousedown
      if (drag?.directNoteHit) {
        const a = drag.anchor;
        const stave = a.staveIndex ?? (score.parts[a.partIndex]?.measures[a.measureIndex]?.voices[a.voiceIndex]?.staff ?? 0);
        const dblMp = measurePositions.find((mp) =>
          mp.partIndex === a.partIndex && mp.measureIndex === a.measureIndex && mp.staveIndex === stave
        );
        setCursorDirect({ partIndex: a.partIndex, measureIndex: a.measureIndex, voiceIndex: a.voiceIndex, eventIndex: a.eventIndex, staveIndex: stave }, dblMp?.isTab ?? false);
        setNoteSelection({
          partIndex: a.partIndex,
          voiceIndex: a.voiceIndex,
          startMeasure: a.measureIndex,
          startEvent: a.eventIndex,
          endMeasure: a.measureIndex,
          endEvent: a.eventIndex,
          anchorMeasure: a.measureIndex,
          anchorEvent: a.eventIndex,
        });
        noteAnchorRef.current = a;
        anchorRef.current = { partIndex: a.partIndex, measureIndex: a.measureIndex };
        return;
      }

      // Double-click on measure area — select the measure
      const mp = hitTestMeasure(x, y);
      if (mp) {
        const currentVoice = useEditorStore.getState().inputState.cursor.voiceIndex;
        const currentStave = useEditorStore.getState().inputState.cursor.staveIndex ?? 0;
        const clickedStave = mp.staveIndex ?? 0;
        let voiceIndex = currentVoice;
        if (clickedStave !== currentStave) {
          const measure = score.parts[mp.partIndex]?.measures[mp.measureIndex];
          const staffVoiceIdx = measure?.voices.findIndex((v) => (v.staff ?? 0) === clickedStave);
          voiceIndex = staffVoiceIdx != null && staffVoiceIdx >= 0 ? staffVoiceIdx : 0;
        }
        setCursorDirect({ partIndex: mp.partIndex, measureIndex: mp.measureIndex, voiceIndex, eventIndex: 0, staveIndex: clickedStave }, mp.isTab ?? false);
        setSelection({
          partIndex: mp.partIndex,
          measureStart: mp.measureIndex,
          measureEnd: mp.measureIndex,
          measureAnchor: mp.measureIndex,
        });
        anchorRef.current = { partIndex: mp.partIndex, measureIndex: mp.measureIndex };
      }
      return;
    }

    // Single click on annotation
    for (const ab of annotationBoxes) {
      if (x >= ab.x - HIT_PADDING && x <= ab.x + ab.width + HIT_PADDING &&
          y >= ab.y - HIT_PADDING && y <= ab.y + ab.height + HIT_PADDING) {
        editAnnotation(ab);
        return;
      }
    }

    // Single click on a note
    const nb = hitTestNote(x, y);
    if (nb) {
      // Use staveIndex from the noteBox if available (set by renderer), otherwise derive from voice
      const clickedStaveIndex = nb.staveIndex ?? (score.parts[nb.partIndex]?.measures[nb.measureIndex]?.voices[nb.voiceIndex]?.staff ?? 0);
      // Detect if clicked note is on a tab stave
      const clickedMp = measurePositions.find((mp) =>
        mp.partIndex === nb.partIndex && mp.measureIndex === nb.measureIndex && mp.staveIndex === clickedStaveIndex
      );
      setCursorDirect({
        partIndex: nb.partIndex,
        measureIndex: nb.measureIndex,
        voiceIndex: nb.voiceIndex,
        eventIndex: nb.eventIndex,
        staveIndex: clickedStaveIndex,
      }, clickedMp?.isTab ?? false);

      if (e.shiftKey && noteAnchorRef.current &&
          noteAnchorRef.current.partIndex === nb.partIndex &&
          noteAnchorRef.current.voiceIndex === nb.voiceIndex) {
        const anchorPos = noteAnchorRef.current.measureIndex * 10000 + noteAnchorRef.current.eventIndex;
        const clickPos = nb.measureIndex * 10000 + nb.eventIndex;
        const startFirst = anchorPos <= clickPos;
        setNoteSelection({
          partIndex: nb.partIndex,
          voiceIndex: nb.voiceIndex,
          startMeasure: startFirst ? noteAnchorRef.current.measureIndex : nb.measureIndex,
          startEvent: startFirst ? noteAnchorRef.current.eventIndex : nb.eventIndex,
          endMeasure: startFirst ? nb.measureIndex : noteAnchorRef.current.measureIndex,
          endEvent: startFirst ? nb.eventIndex : noteAnchorRef.current.eventIndex,
          anchorMeasure: noteAnchorRef.current.measureIndex,
          anchorEvent: noteAnchorRef.current.eventIndex,
        });
      } else if (e.shiftKey && anchorRef.current) {
        setSelection({
          partIndex: nb.partIndex,
          measureStart: Math.min(anchorRef.current.measureIndex, nb.measureIndex),
          measureEnd: Math.max(anchorRef.current.measureIndex, nb.measureIndex),
          measureAnchor: anchorRef.current.measureIndex,
        });
      } else {
        noteAnchorRef.current = { partIndex: nb.partIndex, measureIndex: nb.measureIndex, voiceIndex: nb.voiceIndex, eventIndex: nb.eventIndex };
        anchorRef.current = { partIndex: nb.partIndex, measureIndex: nb.measureIndex };
        // In step entry mode (without insert): select the clicked note
        // Otherwise: just move cursor, clear selection
        const { stepEntry, insertMode } = useEditorStore.getState().inputState;
        if (stepEntry && !insertMode) {
          setNoteSelection({
            partIndex: nb.partIndex,
            voiceIndex: nb.voiceIndex,
            startMeasure: nb.measureIndex,
            startEvent: nb.eventIndex,
            endMeasure: nb.measureIndex,
            endEvent: nb.eventIndex,
            anchorMeasure: nb.measureIndex,
            anchorEvent: nb.eventIndex,
          });
        } else {
          setNoteSelection(null);
          setSelection(null);
        }
      }
      return;
    }

    // Single click on measure
    const currentVoice = useEditorStore.getState().inputState.cursor.voiceIndex;
    const currentStave = useEditorStore.getState().inputState.cursor.staveIndex ?? 0;
    const mp = hitTestMeasure(x, y);
    if (mp) {
      const clickedStave = mp.staveIndex ?? 0;
      let voiceIndex = currentVoice;
      if (clickedStave !== currentStave) {
        const measure = score.parts[mp.partIndex]?.measures[mp.measureIndex];
        const staffVoiceIdx = measure?.voices.findIndex((v) => (v.staff ?? 0) === clickedStave);
        voiceIndex = staffVoiceIdx != null && staffVoiceIdx >= 0 ? staffVoiceIdx : 0;
      }
      setCursorDirect({
        partIndex: mp.partIndex,
        measureIndex: mp.measureIndex,
        voiceIndex,
        eventIndex: 0,
        staveIndex: clickedStave,
      }, mp.isTab ?? false);

      if (e.shiftKey && anchorRef.current) {
        setSelection({
          partIndex: mp.partIndex,
          measureStart: Math.min(anchorRef.current.measureIndex, mp.measureIndex),
          measureEnd: Math.max(anchorRef.current.measureIndex, mp.measureIndex),
          measureAnchor: anchorRef.current.measureIndex,
        });
      } else {
        anchorRef.current = { partIndex: mp.partIndex, measureIndex: mp.measureIndex };
        noteAnchorRef.current = null;
        setSelection(null);
        setNoteSelection(null);
      }
    }
  }, [noteBoxes, annotationBoxes, measurePositions, score, width, titleRect, composerRect, toCanvasCoords, hitTestNote, hitTestMeasure, setCursorDirect, setSelection, setNoteSelection, editAnnotation, setEditingTitle, setEditingComposer]);

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
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        cursor: "default",
        userSelect: "none",
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
            onClick={(e) => { if (e.detail === 1) { setTitleValue(score.title); setEditingTitle(true); } }}
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
              userSelect: "none",
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
            onClick={(e) => { if (e.detail === 1) { setComposerValue(score.composer); setEditingComposer(true); } }}
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
              userSelect: "none",
            }}
          >
            {score.composer || "\u00A0"}
          </div>
        )
      )}
    </div>
  );
}
