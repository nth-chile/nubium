import type { Score, Part, Measure, Voice } from "../model/score";
import type { NoteEvent, NoteHead, Note, Chord, Rest, Slash, GraceNote, TupletRatio, Articulation, ArticulationKind } from "../model/note";
import type { Pitch, PitchClass, Accidental, Octave } from "../model/pitch";
import { durationToTicks, type Duration, type DurationType } from "../model/duration";
import type { Clef, ClefType, TimeSignature, KeySignature, BarlineType } from "../model/time";
import type { NavigationMarks, Volta } from "../model/navigation";
import type { Annotation, ChordSymbol, Lyric, DynamicLevel } from "../model/annotations";
import { newId, type ScoreId, type PartId, type MeasureId, type VoiceId, type NoteEventId } from "../model/ids";
import { INSTRUMENTS } from "../model/instruments";
import {
  XML_TO_DURATION_TYPE,
  ALTER_TO_ACCIDENTAL,
  XML_CLEF_MAP,
  MUSICXML_DIVISIONS,
} from "./types";

/** Detect instrument from MusicXML part metadata */
function detectInstrument(
  partName: string,
  midiProgram: number | null,
  staveCount: number,
  clefType: ClefType,
): string {
  // 1. Match by MIDI program number (most reliable)
  // MusicXML uses 1-based program numbers, our instruments use 0-based GM
  if (midiProgram !== null) {
    const gm0 = midiProgram - 1;
    const byMidi = INSTRUMENTS.find((i) => i.midiProgram === gm0 && gm0 !== 0);
    if (byMidi) return byMidi.id;
  }

  // 2. Match by part name (case-insensitive substring)
  const lower = partName.toLowerCase();
  for (const inst of INSTRUMENTS) {
    const instLower = inst.name.toLowerCase();
    if (lower.includes(instLower) || lower === inst.id) {
      return inst.id;
    }
  }
  // Common aliases
  if (lower.includes("gtr") || lower.includes("guit")) return "guitar";
  if (lower.includes("pno") || lower.includes("keys") || lower.includes("keyboard")) return "piano";
  if (lower.includes("vln") || lower.includes("fiddle")) return "violin";
  if (lower.includes("vla")) return "viola";
  if (lower.includes("vc.") || lower.includes("vlc")) return "cello";
  if (lower.includes("sax") && lower.includes("alt")) return "alto-sax";
  if (lower.includes("sax") && lower.includes("ten")) return "tenor-sax";
  if (lower.includes("tpt") || lower.includes("trp")) return "trumpet";
  if (lower.includes("drum") || lower.includes("perc")) return "drums";

  // 3. Use stave count — 2 staves means piano
  if (staveCount >= 2) return "piano";

  // 4. Default by clef
  if (clefType === "bass") return "bass";
  return "piano";
}

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

function parseDuration(noteEl: Element, _divisions: number): Duration {
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
  let measureKeySig = { ...currentKeySig }; // key sig for THIS measure (may differ from keySig if mid-measure change)
  let divisions = currentDivisions;
  let hasSeenNotes = false; // track whether notes appeared before an attributes change
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
    fermata: "fermata", "up-bow": "up-stroke", "down-bow": "down-stroke",
    "open-string": "open-string", stopped: "stopped",
  };
  const ORNAMENT_MAP: Record<string, ArticulationKind> = {
    "trill-mark": "trill", trill: "trill", mordent: "mordent", turn: "turn",
  };
  const TECHNICAL_MAP: Record<string, ArticulationKind> = {
    "hammer-on": "hammer-on", "pull-off": "pull-off",
    harmonic: "harmonic", "palm-mute": "palm-mute",
    "dead-note": "dead-note", vibrato: "vibrato",
    tap: "tapping", "let-ring": "let-ring",
    // down-bow/up-bow in <technical> context = guitar pick direction (not bowed instrument)
    "down-bow": "down-stroke", "up-bow": "up-stroke",
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
        if (newKeySig) {
          // Always update keySig (carried to next measure), but only update
          // measureKeySig if no notes have been seen yet.  A mid-measure key
          // change is deferred to the next measure since our model stores one
          // key signature per measure.
          keySig = newKeySig;
          if (!hasSeenNotes) {
            measureKeySig = newKeySig;
          }
        }

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
        hasSeenNotes = true;
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
          // Parse <technical> elements (guitar techniques)
          const techEl = getDirectChild(notationsEl, "technical");
          if (techEl) {
            for (let t = 0; t < techEl.childNodes.length; t++) {
              const techChild = techEl.childNodes[t];
              if (techChild.nodeType !== 1) continue;
              const tag = (techChild as Element).tagName;
              // Bends have nested structure
              if (tag === "bend") {
                const alterEl = getDirectChild(techChild as Element, "bend-alter");
                const semitones = alterEl ? parseFloat(alterEl.textContent ?? "2") : 2;
                if (getDirectChild(techChild as Element, "pre-bend")) {
                  noteArticulations.push({ kind: "pre-bend", semitones } as Articulation);
                } else if (getDirectChild(techChild as Element, "release")) {
                  noteArticulations.push({ kind: "bend-release", semitones } as Articulation);
                } else {
                  noteArticulations.push({ kind: "bend", semitones } as Articulation);
                }
                continue;
              }
              // Slides
              if (tag === "slide") {
                const slideType = (techChild as Element).getAttribute("type");
                const lineType = (techChild as Element).getAttribute("line-type");
                if (slideType === "start" && lineType === "dashed") {
                  noteArticulations.push({ kind: "slide-in-below" } as Articulation);
                } else if (slideType === "stop" && lineType === "dashed") {
                  noteArticulations.push({ kind: "slide-out-below" } as Articulation);
                } else {
                  noteArticulations.push({ kind: "slide-up" } as Articulation);
                }
                continue;
              }
              // Fingering → fingerpick
              if (tag === "fingering") {
                const finger = (techChild as Element).textContent?.trim();
                if (finger === "p" || finger === "i" || finger === "m" || finger === "a") {
                  noteArticulations.push({ kind: `fingerpick-${finger}` } as Articulation);
                }
                continue;
              }
              // Other technical → ghost note
              if (tag === "other-technical" && (techChild as Element).textContent?.trim() === "ghost") {
                noteArticulations.push({ kind: "ghost-note" } as Articulation);
                continue;
              }
              // Simple mappings
              const kind = TECHNICAL_MAP[tag];
              if (kind) noteArticulations.push({ kind } as Articulation);
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
        } else if (!isGrace && getTextContent(el, "notehead") === "slash") {
          // Slash notation note
          if (!voiceEvents.has(voiceNum)) voiceEvents.set(voiceNum, []);
          const slashEvt: Slash = {
            kind: "slash",
            id: newId<NoteEventId>("evt"),
            duration,
            ...(tuplet ? { tuplet } : {}),
          };
          voiceEvents.get(voiceNum)!.push(slashEvt);
          if (pendingHarmonies.length > 0) {
            const h = pendingHarmonies.shift()!;
            h.beatOffset = currentTick;
            h.noteEventId = slashEvt.id;
            annotations.push(h);
          }
          if (pendingWedgeStart) {
            openHairpinStartId = slashEvt.id;
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
            // Parse swing from <sound> attributes
            let swing: import("../model/annotations").SwingSettings | undefined;
            if (soundEl) {
              const swingType = soundEl.getAttribute("swing-type");
              const swingFirst = parseInt(soundEl.getAttribute("swing-first") ?? "", 10);
              const swingSecond = parseInt(soundEl.getAttribute("swing-second") ?? "", 10);
              if (swingType && swingFirst && swingSecond) {
                if (swingFirst === 50 && swingSecond === 50) {
                  swing = { style: "straight" };
                } else {
                  const ratio = swingFirst / swingSecond;
                  swing = {
                    style: "swing",
                    ratio: Math.round(ratio * 10) / 10,
                    ...(swingType === "16th" ? { subdivision: "sixteenth" as const } : {}),
                  };
                }
              }
            }
            annotations.push({
              kind: "tempo-mark",
              bpm,
              beatUnit,
              ...(wordsEl?.textContent?.trim() ? { text: wordsEl.textContent.trim() } : {}),
              ...(swing ? { swing } : {}),
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
    keySignature: measureKeySig,
    barlineEnd,
    navigation,
    annotations,
    voices,
    isPickup: isPickup || undefined,
  };

  return { measure, clef, timeSig, keySig, divisions, hairpinState: { openStartId: openHairpinStartId, openType: openHairpinType } };
}

export interface MusicXMLImportResult {
  score: Score;
  /** Per-part display hints detected from MusicXML (slash regions, tab staff-type) */
  displayHints: Record<number, { slash?: boolean; tab?: boolean }>;
  /** Full viewConfig stored by Nubium in <miscellaneous-field> (if present) */
  viewConfig?: import("../views/ViewMode").ViewConfig;
}

export function importFromMusicXML(xml: string): Score;
export function importFromMusicXML(xml: string, withHints: true): MusicXMLImportResult;
export function importFromMusicXML(xml: string, withHints?: true): Score | MusicXMLImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  const scoreEl = doc.getElementsByTagName("score-partwise")[0];
  if (!scoreEl) {
    throw new Error("Invalid MusicXML: missing <score-partwise> element");
  }

  // Parse title
  const title = getTextContent(scoreEl, "work-title") ?? "Untitled";

  // Parse composer and Nubium metadata from <identification>
  const identEl = scoreEl.getElementsByTagName("identification")[0];
  let composer = "";
  let savedViewConfig: import("../views/ViewMode").ViewConfig | undefined;
  if (identEl) {
    const creators = identEl.getElementsByTagName("creator");
    for (let i = 0; i < creators.length; i++) {
      if (creators[i].getAttribute("type") === "composer") {
        composer = creators[i].textContent?.trim() ?? "";
        break;
      }
    }
    // Read Nubium-specific view config from <miscellaneous-field>
    const miscFields = identEl.getElementsByTagName("miscellaneous-field");
    for (let i = 0; i < miscFields.length; i++) {
      if (miscFields[i].getAttribute("name") === "nubium-view-config") {
        try {
          savedViewConfig = JSON.parse(miscFields[i].textContent ?? "");
        } catch { /* ignore malformed */ }
        break;
      }
    }
  }

  // Parse part list for names and MIDI info
  const partNames = new Map<string, { name: string; abbreviation: string; midiProgram: number | null }>();
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
      const midiInstEl = getDirectChild(sp, "midi-instrument");
      const midiProgram = midiInstEl ? getNumberContent(midiInstEl, "midi-program") : null;
      partNames.set(id, { name, abbreviation, midiProgram });
    }
  }

  // Parse parts
  const parts: Part[] = [];
  const displayHints: Record<number, { slash?: boolean; tab?: boolean }> = {};
  const partEls = getDirectChildren(scoreEl, "part");

  for (const partEl of partEls) {
    const partId = partEl.getAttribute("id") ?? "";
    const partInfo = partNames.get(partId) ?? {
      name: `Part ${parts.length + 1}`,
      abbreviation: "",
      midiProgram: null,
    };

    // Detect stave count from first measure's <attributes><staves>
    let xmlStaveCount = 1;
    const firstMeasureEl = getDirectChild(partEl, "measure");
    if (firstMeasureEl) {
      const attrEl = getDirectChild(firstMeasureEl, "attributes");
      if (attrEl) {
        const stavesNum = getNumberContent(attrEl, "staves");
        if (stavesNum !== null) xmlStaveCount = stavesNum;
      }
    }

    let currentClef: Clef = { type: "treble" };
    let currentTimeSig: TimeSignature = { numerator: 4, denominator: 4 };
    let currentKeySig: KeySignature = { fifths: 0 };
    let divisions = MUSICXML_DIVISIONS;

    const measures: Measure[] = [];
    const measureEls = getDirectChildren(partEl, "measure");
    let hairpinState: HairpinState = { openStartId: null, openType: null };

    for (const measureEl of measureEls) {
      // <print new-system="yes"/> or new-page="yes" at the start of this measure
      // means the *previous* measure has a break attached to its end.
      const printEl = getDirectChild(measureEl, "print");
      if (printEl && measures.length > 0) {
        const prev = measures[measures.length - 1];
        if (printEl.getAttribute("new-page") === "yes") {
          prev.break = "page";
        } else if (printEl.getAttribute("new-system") === "yes") {
          prev.break = "system";
        }
      }

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

    // Detect display hints: <measure-style><slash> and <staff-details><staff-type>tab
    const partIdx = parts.length;
    const hints: { slash?: boolean; tab?: boolean } = {};
    for (const mEl of measureEls) {
      // Check <attributes><staff-details><staff-type>tab</staff-type>
      const attrEl = getDirectChild(mEl, "attributes");
      if (attrEl) {
        const staffDetails = getDirectChild(attrEl, "staff-details");
        if (staffDetails && getTextContent(staffDetails, "staff-type") === "tab") {
          hints.tab = true;
        }
      }
      // Check <measure-style><slash type="start"/>
      const msEl = attrEl ? getDirectChild(attrEl, "measure-style") : null;
      if (msEl) {
        const slashEl = getDirectChild(msEl, "slash");
        if (slashEl && slashEl.getAttribute("type") === "start") {
          hints.slash = true;
        }
      }
      if (hints.slash && hints.tab) break; // found both, no need to keep scanning
    }
    if (hints.slash || hints.tab) {
      displayHints[partIdx] = hints;
    }

    const instrumentId = detectInstrument(
      partInfo.name,
      partInfo.midiProgram,
      xmlStaveCount,
      currentClef.type,
    );

    parts.push({
      id: newId<PartId>("prt"),
      name: partInfo.name,
      abbreviation: partInfo.abbreviation,
      instrumentId,
      muted: false,
      solo: false,
      measures,
    });
  }

  // Master playback tempo: prefer a direct <sound tempo> on the first measure
  // (how we round-trip the toolbar BPM). Fall back to the first tempo-mark
  // annotation found anywhere, then to 120.
  let masterTempo = 120;
  const firstPartEl = getDirectChild(scoreEl, "part");
  const firstMeasureEl = firstPartEl ? getDirectChild(firstPartEl, "measure") : null;
  if (firstMeasureEl) {
    for (const soundEl of getDirectChildren(firstMeasureEl, "sound")) {
      const t = parseFloat(soundEl.getAttribute("tempo") ?? "");
      if (t > 0) { masterTempo = t; break; }
    }
  }
  if (masterTempo === 120) {
    outer: for (const part of parts) {
      for (const m of part.measures) {
        for (const ann of m.annotations) {
          if (ann.kind === "tempo-mark") { masterTempo = ann.bpm; break outer; }
        }
      }
    }
  }

  // Normalize barlines across parts: MusicXML sometimes marks a barline on
  // only one part, but barlines are a score-level concept. If any part has a
  // non-single barline at a given measure, propagate it to all parts.
  if (parts.length > 1) {
    const measureCount = parts[0].measures.length;
    for (let mi = 0; mi < measureCount; mi++) {
      let dominant: BarlineType = "single";
      for (const p of parts) {
        const b = p.measures[mi]?.barlineEnd;
        if (b && b !== "single") { dominant = b; break; }
      }
      if (dominant !== "single") {
        for (const p of parts) {
          if (p.measures[mi]) p.measures[mi].barlineEnd = dominant;
        }
      }
    }
  }

  const score: Score = {
    id: newId<ScoreId>("scr"),
    title,
    composer,
    formatVersion: 1,
    tempo: masterTempo,
    parts,
  };

  if (withHints) return { score, displayHints, viewConfig: savedViewConfig };
  return score;
}
