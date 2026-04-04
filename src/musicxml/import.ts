import type { Score, Part, Measure, Voice } from "../model/score";
import type { NoteEvent, NoteHead, Note, Chord, Rest, GraceNote, TupletRatio, Articulation, ArticulationKind } from "../model/note";
import type { Pitch, PitchClass, Accidental, Octave } from "../model/pitch";
import { durationToTicks, type Duration, type DurationType } from "../model/duration";
import type { Clef, ClefType, TimeSignature, KeySignature, BarlineType } from "../model/time";
import type { NavigationMarks, Volta } from "../model/navigation";
import type { Annotation, ChordSymbol, Lyric, DynamicMark, Hairpin, Slur, DynamicLevel } from "../model/annotations";
import { newId, type ScoreId, type PartId, type MeasureId, type VoiceId, type NoteEventId } from "../model/ids";
import {
  XML_TO_DURATION_TYPE,
  ALTER_TO_ACCIDENTAL,
  XML_CLEF_MAP,
  MUSICXML_DIVISIONS,
  DURATION_DIVISIONS,
} from "./types";

function getTextContent(parent: Element, tagName: string): string | null {
  const el = parent.getElementsByTagName(tagName)[0];
  return el ? el.textContent?.trim() ?? null : null;
}

function getNumberContent(parent: Element, tagName: string): number | null {
  const text = getTextContent(parent, tagName);
  if (text === null) return null;
  const num = Number(text);
  return isNaN(num) ? null : num;
}

function getDirectChild(parent: Element, tagName: string): Element | null {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as Element).tagName === tagName) {
      return child as Element;
    }
  }
  return null;
}

function getDirectChildren(parent: Element, tagName: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as Element).tagName === tagName) {
      result.push(child as Element);
    }
  }
  return result;
}

function parseTimeModification(noteEl: Element): TupletRatio | undefined {
  const tmEl = getDirectChild(noteEl, "time-modification");
  if (!tmEl) return undefined;
  const actual = getNumberContent(tmEl, "actual-notes");
  const normal = getNumberContent(tmEl, "normal-notes");
  if (actual === null || normal === null) return undefined;
  return { actual, normal };
}

function parsePitch(noteEl: Element): Pitch | null {
  const pitchEl = getDirectChild(noteEl, "pitch");
  if (!pitchEl) return null;

  const step = getTextContent(pitchEl, "step") as PitchClass | null;
  if (!step) return null;

  const octaveNum = getNumberContent(pitchEl, "octave");
  if (octaveNum === null) return null;
  const octave = Math.max(0, Math.min(9, octaveNum)) as Octave;

  const alter = getNumberContent(pitchEl, "alter") ?? 0;
  const accidental: Accidental = ALTER_TO_ACCIDENTAL[alter] ?? "natural";

  return { pitchClass: step, accidental, octave };
}

function parseDuration(noteEl: Element, divisions: number): Duration {
  const typeText = getTextContent(noteEl, "type");
  const durationType: DurationType = typeText
    ? XML_TO_DURATION_TYPE[typeText] ?? "quarter"
    : "quarter";

  const dotEls = getDirectChildren(noteEl, "dot");
  const dots = Math.min(3, dotEls.length) as 0 | 1 | 2 | 3;

  return { type: durationType, dots };
}

function parseClef(attrEl: Element): Clef | null {
  const clefEl = getDirectChild(attrEl, "clef");
  if (!clefEl) return null;

  const sign = getTextContent(clefEl, "sign") ?? "G";
  const line = getNumberContent(clefEl, "line") ?? 2;
  const key = `${sign}${line}`;
  const clefType: ClefType = XML_CLEF_MAP[key] ?? "treble";

  return { type: clefType };
}

function parseKeySignature(attrEl: Element): KeySignature | null {
  const keyEl = getDirectChild(attrEl, "key");
  if (!keyEl) return null;

  const fifths = getNumberContent(keyEl, "fifths") ?? 0;
  const mode = getTextContent(keyEl, "mode") as "major" | "minor" | undefined;

  return { fifths, mode: mode || undefined };
}

function parseTimeSignature(attrEl: Element): TimeSignature | null {
  const timeEl = getDirectChild(attrEl, "time");
  if (!timeEl) return null;

  const beats = getNumberContent(timeEl, "beats") ?? 4;
  const beatType = getNumberContent(timeEl, "beat-type") ?? 4;

  return { numerator: beats, denominator: beatType };
}

function parseHarmony(harmonyEl: Element, currentTick: number): ChordSymbol | null {
  const rootEl = getDirectChild(harmonyEl, "root");
  if (!rootEl) return null;

  const rootStep = getTextContent(rootEl, "root-step") ?? "C";
  const rootAlter = getNumberContent(rootEl, "root-alter");

  let text = rootStep;
  if (rootAlter === 1) text += "#";
  else if (rootAlter === -1) text += "b";

  const kindEl = getDirectChild(harmonyEl, "kind");
  if (kindEl) {
    const kindText = kindEl.getAttribute("text");
    if (kindText) {
      text += kindText;
    }
  }

  // noteEventId is assigned in post-processing after notes are parsed
  return {
    kind: "chord-symbol",
    text,
    beatOffset: currentTick,
    noteEventId: "" as NoteEventId,
  };
}

function parseLyric(noteEl: Element, eventId: NoteEventId): Lyric[] {
  const lyricEls = getDirectChildren(noteEl, "lyric");
  const lyrics: Lyric[] = [];

  for (const lyricEl of lyricEls) {
    const numberAttr = lyricEl.getAttribute("number");
    const verseNumber = numberAttr ? parseInt(numberAttr, 10) : 1;
    const syllabic = getTextContent(lyricEl, "syllabic") ?? "single";
    const text = getTextContent(lyricEl, "text") ?? "";

    const syllableType = (
      ["begin", "middle", "end", "single"].includes(syllabic)
        ? syllabic
        : "single"
    ) as "begin" | "middle" | "end" | "single";

    lyrics.push({
      kind: "lyric",
      text,
      noteEventId: eventId,
      syllableType,
      verseNumber: isNaN(verseNumber) ? 1 : verseNumber,
    });
  }

  return lyrics;
}

function parseBarline(measureEl: Element): { barlineEnd: BarlineType; volta?: Volta } {
  const barlineEls = getDirectChildren(measureEl, "barline");
  let hasRepeatStart = false;
  let hasRepeatEnd = false;
  let barlineEnd: BarlineType = "single";
  let volta: Volta | undefined = undefined;

  for (const barlineEl of barlineEls) {
    const location = barlineEl.getAttribute("location") ?? "right";
    const barStyle = getTextContent(barlineEl, "bar-style");
    const repeatEl = getDirectChild(barlineEl, "repeat");

    if (repeatEl) {
      const direction = repeatEl.getAttribute("direction");
      if (direction === "forward") hasRepeatStart = true;
      if (direction === "backward") hasRepeatEnd = true;
    } else if (location === "right") {
      if (barStyle === "light-light") barlineEnd = "double";
      else if (barStyle === "light-heavy") barlineEnd = "final";
    }

    // Parse volta (ending) brackets
    const endingEl = getDirectChild(barlineEl, "ending");
    if (endingEl) {
      const endingType = endingEl.getAttribute("type");
      if (endingType === "start") {
        const number = endingEl.getAttribute("number") ?? "1";
        const endings = number.split(",").map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
        const label = endingEl.textContent?.trim() || undefined;
        volta = { endings, label };
      }
    }
  }

  // Determine final barline type
  if (hasRepeatStart && hasRepeatEnd) barlineEnd = "repeat-both";
  else if (hasRepeatEnd) barlineEnd = "repeat-end";
  else if (hasRepeatStart) barlineEnd = "repeat-start";

  return { barlineEnd, volta };
}

interface HairpinState {
  openStartId: NoteEventId | null;
  openType: "crescendo" | "diminuendo" | null;
}

function parseMeasure(
  measureEl: Element,
  currentClef: Clef,
  currentTimeSig: TimeSignature,
  currentKeySig: KeySignature,
  currentDivisions: number,
  hairpinState?: HairpinState
): { measure: Measure; clef: Clef; timeSig: TimeSignature; keySig: KeySignature; divisions: number; hairpinState: HairpinState } {
  let clef = { ...currentClef };
  let timeSig = { ...currentTimeSig };
  let keySig = { ...currentKeySig };
  let divisions = currentDivisions;
  const annotations: Annotation[] = [];

  // Group note events by voice, track staff assignments
  const voiceEvents = new Map<number, NoteEvent[]>();
  const voiceStaffMap = new Map<number, number>();
  let currentTick = 0;
  let lastFlushedEventId: NoteEventId | null = null;

  // Pending harmonies — assigned to notes as they're processed
  let pendingHarmonies: ChordSymbol[] = [];

  // Track pending chord notes to merge
  let pendingChordHeads: NoteHead[] = [];
  let pendingChordDuration: Duration | null = null;
  let pendingChordEventId: NoteEventId | null = null;
  let pendingChordLyrics: Lyric[] = [];
  let pendingChordTuplet: TupletRatio | undefined = undefined;
  let pendingVoiceNum = 1;

  // Track pending dynamics/hairpins to attach to the next note
  let pendingDynamicLevels: DynamicLevel[] = [];
  let pendingWedgeStart: "crescendo" | "diminuendo" | null = null;
  let openHairpinStartId: NoteEventId | null = hairpinState?.openStartId ?? null;
  let openHairpinType: "crescendo" | "diminuendo" | null = hairpinState?.openType ?? null;

  // Track open slurs: slur number -> start event id
  const openSlurs = new Map<number, NoteEventId>();

  // Track articulations parsed from notations
  let pendingArticulations: Articulation[] = [];

  // Navigation marks for the measure
  let navigation: NavigationMarks | undefined = undefined;

  const DYNAMIC_LEVELS: Set<string> = new Set(["pp", "p", "mp", "mf", "f", "ff", "sfz", "fp"]);

  // MusicXML articulation name → our ArticulationKind
  const ARTICULATION_MAP: Record<string, ArticulationKind> = {
    staccato: "staccato", staccatissimo: "staccatissimo",
    accent: "accent", tenuto: "tenuto", "strong-accent": "marcato",
    fermata: "fermata", "up-bow": "up-bow", "down-bow": "down-bow",
    "open-string": "open-string", stopped: "stopped",
  };
  const ORNAMENT_MAP: Record<string, ArticulationKind> = {
    "trill-mark": "trill", trill: "trill", mordent: "mordent", turn: "turn",
  };

  function flushPendingChord() {
    if (pendingChordHeads.length > 0 && pendingChordDuration) {
      const voiceNum = pendingVoiceNum;
      if (!voiceEvents.has(voiceNum)) voiceEvents.set(voiceNum, []);

      const arts = pendingArticulations.length > 0 ? pendingArticulations : undefined;
      pendingArticulations = [];

      if (pendingChordHeads.length === 1) {
        const note: Note = {
          kind: "note",
          id: pendingChordEventId!,
          duration: pendingChordDuration,
          head: pendingChordHeads[0],
          tuplet: pendingChordTuplet,
          articulations: arts,
        };
        voiceEvents.get(voiceNum)!.push(note);
      } else {
        const chord: Chord = {
          kind: "chord",
          id: pendingChordEventId!,
          duration: pendingChordDuration,
          heads: pendingChordHeads,
          tuplet: pendingChordTuplet,
          articulations: arts,
        };
        voiceEvents.get(voiceNum)!.push(chord);
      }

      // Add lyrics as annotations
      for (const lyric of pendingChordLyrics) {
        annotations.push(lyric);
      }

      // Attach pending dynamics to this event
      for (const level of pendingDynamicLevels) {
        annotations.push({ kind: "dynamic", level, noteEventId: pendingChordEventId! });
      }
      pendingDynamicLevels = [];

      lastFlushedEventId = pendingChordEventId;
      pendingChordHeads = [];
      pendingChordDuration = null;
      pendingChordEventId = null;
      pendingChordLyrics = [];
      pendingChordTuplet = undefined;
    }
  }

  const children = measureEl.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== 1) continue;
    const el = child as Element;

    switch (el.tagName) {
      case "attributes": {
        const newDivisions = getNumberContent(el, "divisions");
        if (newDivisions !== null) divisions = newDivisions;

        const newClef = parseClef(el);
        if (newClef) clef = newClef;

        const newKeySig = parseKeySignature(el);
        if (newKeySig) keySig = newKeySig;

        const newTimeSig = parseTimeSignature(el);
        if (newTimeSig) timeSig = newTimeSig;
        break;
      }

      case "harmony": {
        const cs = parseHarmony(el, currentTick);
        if (cs) pendingHarmonies.push(cs);
        break;
      }

      case "note": {
        const isChord = getDirectChild(el, "chord") !== null;
        const isRest = getDirectChild(el, "rest") !== null;
        const isGrace = getDirectChild(el, "grace") !== null;
        const voiceText = getTextContent(el, "voice");
        const voiceNum = voiceText ? parseInt(voiceText, 10) : 1;
        const staffText = getTextContent(el, "staff");
        const staffNum = staffText ? parseInt(staffText, 10) : 1;
        if (!voiceStaffMap.has(voiceNum)) voiceStaffMap.set(voiceNum, staffNum);

        if (!isChord) {
          // Flush any pending chord from previous note
          flushPendingChord();
        }

        const duration = parseDuration(el, divisions);
        const durationDivs = getNumberContent(el, "duration") ?? 0;
        const tuplet = parseTimeModification(el);

        // Parse articulations and ornaments from <notations>
        const notationsEl = getDirectChild(el, "notations");
        const noteArticulations: Articulation[] = [];
        if (notationsEl) {
          const artEl = getDirectChild(notationsEl, "articulations");
          if (artEl) {
            for (let a = 0; a < artEl.childNodes.length; a++) {
              const artChild = artEl.childNodes[a];
              if (artChild.nodeType === 1) {
                const kind = ARTICULATION_MAP[(artChild as Element).tagName];
                if (kind) noteArticulations.push({ kind } as Articulation);
              }
            }
          }
          // Fermata is a direct child of <notations>, not <articulations>
          if (getDirectChild(notationsEl, "fermata")) {
            noteArticulations.push({ kind: "fermata" });
          }
          const ornEl = getDirectChild(notationsEl, "ornaments");
          if (ornEl) {
            for (let o = 0; o < ornEl.childNodes.length; o++) {
              const ornChild = ornEl.childNodes[o];
              if (ornChild.nodeType === 1) {
                const kind = ORNAMENT_MAP[(ornChild as Element).tagName];
                if (kind) noteArticulations.push({ kind } as Articulation);
              }
            }
          }
        }

        if (isRest) {
          if (!voiceEvents.has(voiceNum)) voiceEvents.set(voiceNum, []);
          const rest: Rest = {
            kind: "rest",
            id: newId<NoteEventId>("evt"),
            duration,
            tuplet,
          };
          voiceEvents.get(voiceNum)!.push(rest);
          // Assign one pending harmony to this beat position
          if (pendingHarmonies.length > 0) {
            const h = pendingHarmonies.shift()!;
            h.beatOffset = currentTick;
            h.noteEventId = rest.id;
            annotations.push(h);
          }
          // Start a hairpin at this event if pending
          if (pendingWedgeStart) {
            openHairpinStartId = rest.id;
            openHairpinType = pendingWedgeStart;
            pendingWedgeStart = null;
          }
          currentTick += durationDivs;
        } else if (isGrace) {
          // Grace note — no duration consumed
          const pitch = parsePitch(el);
          if (!pitch) break;
          const graceEl = getDirectChild(el, "grace")!;
          const slash = graceEl.getAttribute("slash") === "yes";
          if (!voiceEvents.has(voiceNum)) voiceEvents.set(voiceNum, []);
          const grace: GraceNote = {
            kind: "grace",
            id: newId<NoteEventId>("evt"),
            duration,
            head: { pitch },
            slash: slash || undefined,
            articulations: noteArticulations.length > 0 ? noteArticulations : undefined,
          };
          voiceEvents.get(voiceNum)!.push(grace);
        } else {
          const pitch = parsePitch(el);
          if (!pitch) break;

          // Check for tie
          const tieEls = getDirectChildren(el, "tie");
          const isTiedStart = tieEls.some(
            (t) => t.getAttribute("type") === "start"
          );

          const head: NoteHead = {
            pitch,
            tied: isTiedStart || undefined,
          };

          const eventId = newId<NoteEventId>("evt");
          const lyrics = parseLyric(el, eventId);

          if (isChord) {
            // Add to pending chord
            pendingChordHeads.push(head);
          } else {
            pendingChordHeads = [head];
            pendingChordDuration = duration;
            pendingChordEventId = eventId;
            pendingChordLyrics = lyrics;
            pendingChordTuplet = tuplet;
            pendingVoiceNum = voiceNum;
            pendingArticulations = noteArticulations;
            // Assign one pending harmony to this beat position
            if (pendingHarmonies.length > 0) {
              const h = pendingHarmonies.shift()!;
              h.beatOffset = currentTick;
              h.noteEventId = eventId;
              annotations.push(h);
            }
            // Start a hairpin at this event if pending
            if (pendingWedgeStart) {
              openHairpinStartId = eventId;
              openHairpinType = pendingWedgeStart;
              pendingWedgeStart = null;
            }
            currentTick += durationDivs;
          }

          // Parse slur elements inside <notations>
          if (notationsEl) {
            const slurEls = getDirectChildren(notationsEl, "slur");
            const slurEventId = isChord ? pendingChordEventId! : eventId;
            for (const slurEl of slurEls) {
              const slurType = slurEl.getAttribute("type");
              const slurNumber = parseInt(slurEl.getAttribute("number") ?? "1", 10);
              if (slurType === "start") {
                openSlurs.set(slurNumber, slurEventId);
              } else if (slurType === "stop") {
                const startId = openSlurs.get(slurNumber);
                if (startId) {
                  annotations.push({
                    kind: "slur",
                    startEventId: startId,
                    endEventId: slurEventId,
                  });
                  openSlurs.delete(slurNumber);
                }
              }
            }
          }
        }
        break;
      }

      case "forward": {
        flushPendingChord();
        const forwardDur = getNumberContent(el, "duration") ?? 0;
        currentTick += forwardDur;
        break;
      }

      case "backup": {
        flushPendingChord();
        const backupDur = getNumberContent(el, "duration") ?? 0;
        currentTick -= backupDur;
        break;
      }

      case "direction": {
        const dirTypeEl = getDirectChild(el, "direction-type");
        if (!dirTypeEl) break;

        // Parse dynamics
        // If there's already a pending chord, flush it first —
        // this dynamic belongs to the NEXT note, not the pending one.
        const dynamicsEl = getDirectChild(dirTypeEl, "dynamics");
        if (dynamicsEl) {
          if (pendingChordHeads.length > 0) {
            flushPendingChord();
          }
          for (let d = 0; d < dynamicsEl.childNodes.length; d++) {
            const dynChild = dynamicsEl.childNodes[d];
            if (dynChild.nodeType === 1 && DYNAMIC_LEVELS.has((dynChild as Element).tagName)) {
              pendingDynamicLevels.push((dynChild as Element).tagName as DynamicLevel);
            }
          }
        }

        // Parse rehearsal marks
        const rehearsalEl = getDirectChild(dirTypeEl, "rehearsal");
        if (rehearsalEl) {
          annotations.push({
            kind: "rehearsal-mark",
            text: rehearsalEl.textContent?.trim() || "A",
          });
        }

        // Parse tempo marks from <sound> or <metronome>
        const soundEl = getDirectChild(el, "sound");
        const metronomeEl = getDirectChild(dirTypeEl, "metronome");
        if (soundEl || metronomeEl) {
          let bpm = 0;
          let beatUnit: import("../model/duration").DurationType = "quarter";
          if (soundEl) {
            bpm = parseFloat(soundEl.getAttribute("tempo") ?? "0");
          }
          if (metronomeEl) {
            const buEl = getDirectChild(metronomeEl, "beat-unit");
            const pmEl = getDirectChild(metronomeEl, "per-minute");
            if (buEl?.textContent) {
              const buMap: Record<string, import("../model/duration").DurationType> = {
                whole: "whole", half: "half", quarter: "quarter",
                eighth: "eighth", "16th": "16th", "32nd": "32nd", "64th": "64th",
              };
              beatUnit = buMap[buEl.textContent.trim()] ?? "quarter";
            }
            if (pmEl?.textContent) bpm = parseFloat(pmEl.textContent.trim()) || bpm;
          }
          if (bpm > 0) {
            // Check for text label (e.g. "Allegro") in <words> element
            const wordsEl = getDirectChild(dirTypeEl, "words");
            annotations.push({
              kind: "tempo-mark",
              bpm,
              beatUnit,
              ...(wordsEl?.textContent?.trim() ? { text: wordsEl.textContent.trim() } : {}),
            });
          }
        }

        // Parse navigation marks (segno, coda)
        if (getDirectChild(dirTypeEl, "segno")) {
          if (!navigation) navigation = {};
          navigation.segno = true;
        }
        if (getDirectChild(dirTypeEl, "coda")) {
          if (!navigation) navigation = {};
          navigation.coda = true;
        }
        // Parse fine, D.S., D.C. from <words> or <sound>
        const dirWordsEl = getDirectChild(dirTypeEl, "words");
        const dirWords = dirWordsEl?.textContent?.trim()?.toLowerCase() ?? "";
        if (dirWords.includes("fine")) {
          if (!navigation) navigation = {};
          navigation.fine = true;
        }
        if (dirWords.includes("d.s.") || dirWords.includes("dal segno")) {
          if (!navigation) navigation = {};
          navigation.dsText = dirWordsEl?.textContent?.trim();
        }
        if (dirWords.includes("d.c.") || dirWords.includes("da capo")) {
          if (!navigation) navigation = {};
          navigation.dcText = dirWordsEl?.textContent?.trim();
        }
        if (dirWords.includes("to coda") || dirWords.includes("al coda")) {
          if (!navigation) navigation = {};
          navigation.toCoda = true;
        }
        // Also check <sound> for segno/coda/fine/dacapo/dalsegno
        const dirSoundEl = getDirectChild(el, "sound");
        if (dirSoundEl) {
          if (dirSoundEl.getAttribute("segno")) {
            if (!navigation) navigation = {};
            navigation.segno = true;
          }
          if (dirSoundEl.getAttribute("coda")) {
            if (!navigation) navigation = {};
            navigation.coda = true;
          }
          if (dirSoundEl.getAttribute("fine") === "yes") {
            if (!navigation) navigation = {};
            navigation.fine = true;
          }
          if (dirSoundEl.getAttribute("dacapo") === "yes") {
            if (!navigation) navigation = {};
            navigation.dcText = navigation.dcText ?? "D.C.";
          }
          if (dirSoundEl.getAttribute("dalsegno")) {
            if (!navigation) navigation = {};
            navigation.dsText = navigation.dsText ?? "D.S.";
          }
        }

        // Parse wedge (hairpin)
        const wedgeEl = getDirectChild(dirTypeEl, "wedge");
        if (wedgeEl) {
          const wedgeType = wedgeEl.getAttribute("type");
          if (wedgeType === "crescendo" || wedgeType === "diminuendo") {
            pendingWedgeStart = wedgeType;
          } else if (wedgeType === "stop" && openHairpinStartId && openHairpinType) {
            // Close the hairpin — endEventId is the current pending note or last flushed
            const endId = pendingChordEventId ?? lastFlushedEventId ?? openHairpinStartId;
            annotations.push({
              kind: "hairpin",
              type: openHairpinType,
              startEventId: openHairpinStartId,
              endEventId: endId,
            });
            openHairpinStartId = null;
            openHairpinType = null;
          }
        }
        break;
      }

      // Skip unknown elements gracefully
      default:
        break;
    }
  }

  // Flush any remaining pending chord
  flushPendingChord();

  // Flush any remaining pending harmonies
  for (const h of pendingHarmonies) {
    h.beatOffset = currentTick;
    annotations.push(h);
  }
  pendingHarmonies = [];

  // Build voices
  const voices: Voice[] = [];
  const sortedVoiceNums = Array.from(voiceEvents.keys()).sort((a, b) => a - b);

  for (const voiceNum of sortedVoiceNums) {
    const staffNum = voiceStaffMap.get(voiceNum) ?? 1;
    voices.push({
      id: newId<VoiceId>("vce"),
      events: voiceEvents.get(voiceNum)!,
      ...(staffNum > 1 ? { staff: staffNum - 1 } : {}),
    });
  }

  // Ensure at least one voice
  if (voices.length === 0) {
    voices.push({ id: newId<VoiceId>("vce"), events: [] });
  }

  const barlineResult = parseBarline(measureEl);
  const barlineEnd = barlineResult.barlineEnd;

  // Add volta to navigation if present
  if (barlineResult.volta) {
    if (!navigation) navigation = {};
    navigation.volta = barlineResult.volta;
  }

  // Match chord symbols without noteEventId to note events by tick position (voice 1)
  const v1Events = voices[0]?.events ?? [];
  for (const ann of annotations) {
    if (ann.kind !== "chord-symbol") continue;
    if (ann.noteEventId) continue; // Already assigned during parsing
    let tick = 0;
    for (const ev of v1Events) {
      if (ev.kind === "grace") continue;
      if (tick >= ann.beatOffset) {
        ann.noteEventId = ev.id;
        break;
      }
      tick += durationToTicks(ev.duration, ev.tuplet);
    }
    // If no match found (chord at end of measure), use last event
    if (!ann.noteEventId && v1Events.length > 0) {
      ann.noteEventId = v1Events[v1Events.length - 1].id;
    }
  }

  // Detect pickup measure: check if measure number is "0" or has implicit="yes"
  const measureNum = measureEl.getAttribute("number");
  const implicit = measureEl.getAttribute("implicit");
  const isPickup = measureNum === "0" || implicit === "yes";

  const measure: Measure = {
    id: newId<MeasureId>("msr"),
    clef,
    timeSignature: timeSig,
    keySignature: keySig,
    barlineEnd,
    navigation,
    annotations,
    voices,
    isPickup: isPickup || undefined,
  };

  return { measure, clef, timeSig, keySig, divisions, hairpinState: { openStartId: openHairpinStartId, openType: openHairpinType } };
}

export function importFromMusicXML(xml: string): Score {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  const scoreEl = doc.getElementsByTagName("score-partwise")[0];
  if (!scoreEl) {
    throw new Error("Invalid MusicXML: missing <score-partwise> element");
  }

  // Parse title
  const title = getTextContent(scoreEl, "work-title") ?? "Untitled";

  // Parse composer
  const identEl = scoreEl.getElementsByTagName("identification")[0];
  let composer = "";
  if (identEl) {
    const creators = identEl.getElementsByTagName("creator");
    for (let i = 0; i < creators.length; i++) {
      if (creators[i].getAttribute("type") === "composer") {
        composer = creators[i].textContent?.trim() ?? "";
        break;
      }
    }
  }

  // Parse part list for names
  const partNames = new Map<string, { name: string; abbreviation: string }>();
  const partListEl = scoreEl.getElementsByTagName("part-list")[0];
  if (partListEl) {
    const scoreParts = partListEl.getElementsByTagName("score-part");
    for (let i = 0; i < scoreParts.length; i++) {
      const sp = scoreParts[i];
      const id = sp.getAttribute("id") ?? "";
      const name = getTextContent(sp, "part-name") ?? `Part ${i + 1}`;
      const abbreviation = getTextContent(sp, "part-abbreviation")
        ?? (getDirectChild(sp, "part-name-display")
          ? getTextContent(getDirectChild(sp, "part-name-display")!, "display-text") ?? ""
          : "");
      partNames.set(id, { name, abbreviation });
    }
  }

  // Parse parts
  const parts: Part[] = [];
  const partEls = getDirectChildren(scoreEl, "part");

  for (const partEl of partEls) {
    const partId = partEl.getAttribute("id") ?? "";
    const partInfo = partNames.get(partId) ?? {
      name: `Part ${parts.length + 1}`,
      abbreviation: "",
    };

    let currentClef: Clef = { type: "treble" };
    let currentTimeSig: TimeSignature = { numerator: 4, denominator: 4 };
    let currentKeySig: KeySignature = { fifths: 0 };
    let divisions = MUSICXML_DIVISIONS;

    const measures: Measure[] = [];
    const measureEls = getDirectChildren(partEl, "measure");
    let hairpinState: HairpinState = { openStartId: null, openType: null };

    for (const measureEl of measureEls) {
      const result = parseMeasure(
        measureEl,
        currentClef,
        currentTimeSig,
        currentKeySig,
        divisions,
        hairpinState
      );
      measures.push(result.measure);
      currentClef = result.clef;
      currentTimeSig = result.timeSig;
      currentKeySig = result.keySig;
      divisions = result.divisions;
      hairpinState = result.hairpinState;
    }

    parts.push({
      id: newId<PartId>("prt"),
      name: partInfo.name,
      abbreviation: partInfo.abbreviation,
      instrumentId: "piano",
      muted: false,
      solo: false,
      measures,
    });
  }

  return {
    id: newId<ScoreId>("scr"),
    title,
    composer,
    formatVersion: 1,
    tempo: 120,
    parts,
  };
}
