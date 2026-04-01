import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "../index";
import { factory } from "../../model";
import type { Annotation } from "../../model/annotations";
import type { NoteEventId } from "../../model/ids";

describe("annotation serialization round-trip", () => {
  it("round-trips chord symbols", () => {
    const noteId1 = "evt_chord1" as NoteEventId;
    const noteId2 = "evt_chord2" as NoteEventId;
    const annotations: Annotation[] = [
      { kind: "chord-symbol", text: "Cmaj7", beatOffset: 0, noteEventId: noteId1 },
      { kind: "chord-symbol", text: "Dm7", beatOffset: 960, noteEventId: noteId2 },
    ];

    const s = factory.score("Chords Test", "", [
      factory.part("Piano", "Pno.", [
        factory.measure(
          [factory.voice([factory.note("C", 4, factory.dur("whole"))])],
          { annotations }
        ),
      ]),
    ]);

    const text = serialize(s);
    const json = JSON.parse(text);
    const measureAnnotations = json.parts[0].measures[0].annotations;
    expect(measureAnnotations).toHaveLength(2);
    expect(measureAnnotations[0].symbol).toBe("Cmaj7");
    expect(measureAnnotations[1].symbol).toBe("Dm7");

    const parsed = deserialize(text);
    const m = parsed.parts[0].measures[0];
    expect(m.annotations).toHaveLength(2);

    const chords = m.annotations.filter((a) => a.kind === "chord-symbol");
    expect(chords).toHaveLength(2);
    expect(chords[0].kind === "chord-symbol" && chords[0].text).toBe("Cmaj7");
    expect(chords[0].kind === "chord-symbol" && chords[0].beatOffset).toBe(0);
    expect(chords[1].kind === "chord-symbol" && chords[1].text).toBe("Dm7");
    expect(chords[1].kind === "chord-symbol" && chords[1].beatOffset).toBe(960);
  });

  it("round-trips lyrics", () => {
    const noteId = "evt_testlyric1" as NoteEventId;
    const annotations: Annotation[] = [
      {
        kind: "lyric",
        text: "hel",
        noteEventId: noteId,
        syllableType: "begin",
        verseNumber: 1,
      },
    ];

    const s = factory.score("Lyrics Test", "", [
      factory.part("Voice", "Vox", [
        factory.measure(
          [factory.voice([factory.note("C", 4, factory.dur("quarter"))])],
          { annotations }
        ),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);
    const m = parsed.parts[0].measures[0];
    const lyrics = m.annotations.filter((a) => a.kind === "lyric");
    expect(lyrics).toHaveLength(1);
    if (lyrics[0].kind === "lyric") {
      expect(lyrics[0].text).toBe("hel");
      expect(lyrics[0].noteEventId).toBe(noteId);
      expect(lyrics[0].syllableType).toBe("begin");
      expect(lyrics[0].verseNumber).toBe(1);
    }
  });

  it("round-trips multi-verse lyrics", () => {
    const noteId = "evt_multiverse" as NoteEventId;
    const annotations: Annotation[] = [
      {
        kind: "lyric",
        text: "Hel",
        noteEventId: noteId,
        syllableType: "begin",
        verseNumber: 1,
      },
      {
        kind: "lyric",
        text: "Good",
        noteEventId: noteId,
        syllableType: "begin",
        verseNumber: 2,
      },
    ];

    const s = factory.score("Multi-Verse Test", "", [
      factory.part("Voice", "Vox", [
        factory.measure(
          [factory.voice([factory.note("C", 4, factory.dur("quarter"))])],
          { annotations }
        ),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);
    const m = parsed.parts[0].measures[0];
    const lyrics = m.annotations.filter((a) => a.kind === "lyric");
    expect(lyrics).toHaveLength(2);

    const v1 = lyrics.find((a) => a.kind === "lyric" && a.verseNumber === 1);
    const v2 = lyrics.find((a) => a.kind === "lyric" && a.verseNumber === 2);
    expect(v1).toBeDefined();
    expect(v2).toBeDefined();
    if (v1?.kind === "lyric") {
      expect(v1.text).toBe("Hel");
      expect(v1.syllableType).toBe("begin");
    }
    if (v2?.kind === "lyric") {
      expect(v2.text).toBe("Good");
      expect(v2.verseNumber).toBe(2);
    }
  });

  it("round-trips rehearsal marks", () => {
    const annotations: Annotation[] = [
      { kind: "rehearsal-mark", text: "A" },
    ];

    const s = factory.score("Rehearsal Test", "", [
      factory.part("Piano", "Pno.", [
        factory.measure(
          [factory.voice([factory.note("C", 4, factory.dur("whole"))])],
          { annotations }
        ),
      ]),
    ]);

    const text = serialize(s);
    const json = JSON.parse(text);
    expect(json.parts[0].measures[0].annotations[0].label).toBe("A");

    const parsed = deserialize(text);
    const m = parsed.parts[0].measures[0];
    const marks = m.annotations.filter((a) => a.kind === "rehearsal-mark");
    expect(marks).toHaveLength(1);
    if (marks[0].kind === "rehearsal-mark") {
      expect(marks[0].text).toBe("A");
    }
  });

  it("round-trips tempo marks", () => {
    const annotations: Annotation[] = [
      { kind: "tempo-mark", bpm: 120, beatUnit: "quarter", text: "Allegro" },
    ];

    const s = factory.score("Tempo Test", "", [
      factory.part("Piano", "Pno.", [
        factory.measure(
          [factory.voice([factory.note("C", 4, factory.dur("whole"))])],
          { annotations }
        ),
      ]),
    ]);

    const text = serialize(s);
    const json = JSON.parse(text);
    const tempoAnno = json.parts[0].measures[0].annotations[0];
    expect(tempoAnno.bpm).toBe(120);
    expect(tempoAnno.text).toBe("Allegro");

    const parsed = deserialize(text);
    const m = parsed.parts[0].measures[0];
    const tempos = m.annotations.filter((a) => a.kind === "tempo-mark");
    expect(tempos).toHaveLength(1);
    if (tempos[0].kind === "tempo-mark") {
      expect(tempos[0].bpm).toBe(120);
      expect(tempos[0].beatUnit).toBe("quarter");
      expect(tempos[0].text).toBe("Allegro");
    }
  });

  it("round-trips tempo marks without text", () => {
    const annotations: Annotation[] = [
      { kind: "tempo-mark", bpm: 80, beatUnit: "half" },
    ];

    const s = factory.score("Tempo Test 2", "", [
      factory.part("Piano", "Pno.", [
        factory.measure(
          [factory.voice([factory.note("C", 4, factory.dur("whole"))])],
          { annotations }
        ),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);
    const m = parsed.parts[0].measures[0];
    const tempos = m.annotations.filter((a) => a.kind === "tempo-mark");
    expect(tempos).toHaveLength(1);
    if (tempos[0].kind === "tempo-mark") {
      expect(tempos[0].bpm).toBe(80);
      expect(tempos[0].beatUnit).toBe("half");
      expect(tempos[0].text).toBeUndefined();
    }
  });

  it("round-trips measures with mixed annotations", () => {
    const annotations: Annotation[] = [
      { kind: "chord-symbol", text: "Am7", beatOffset: 0, noteEventId: "evt_mixed1" as NoteEventId },
      { kind: "rehearsal-mark", text: "Intro" },
      { kind: "tempo-mark", bpm: 140, beatUnit: "quarter", text: "Vivace" },
    ];

    const s = factory.score("Mixed Test", "", [
      factory.part("Piano", "Pno.", [
        factory.measure(
          [factory.voice([factory.note("A", 4, factory.dur("whole"))])],
          { annotations }
        ),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);
    const m = parsed.parts[0].measures[0];
    expect(m.annotations).toHaveLength(3);
    expect(m.annotations.map((a) => a.kind).sort()).toEqual([
      "chord-symbol",
      "rehearsal-mark",
      "tempo-mark",
    ]);
  });

  it("preserves annotations across empty measures", () => {
    const s = factory.score("Empty Measure Test", "", [
      factory.part("Piano", "Pno.", [
        factory.measure(
          [factory.voice([])],
          { annotations: [{ kind: "rehearsal-mark", text: "B" }] }
        ),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);
    const m = parsed.parts[0].measures[0];
    expect(m.annotations).toHaveLength(1);
    if (m.annotations[0].kind === "rehearsal-mark") {
      expect(m.annotations[0].text).toBe("B");
    }
  });
});
