import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { exportToMusicXML } from "../export";
import { importFromMusicXML } from "../import";
import { factory } from "../../model";

beforeAll(() => {
  // Provide DOMParser for Node environment
  if (typeof globalThis.DOMParser === "undefined") {
    const jsdom = new JSDOM();
    globalThis.DOMParser = jsdom.window.DOMParser;
  }
});

function makeSimpleScore() {
  const n1 = factory.note("C", 4, factory.dur("quarter"));
  const n2 = factory.note("D", 4, factory.dur("quarter"));
  const n3 = factory.note("E", 4, factory.dur("half"));
  const v = factory.voice([n1, n2, n3]);
  const m = factory.measure([v]);
  const p = factory.part("Piano", "Pno", [m]);
  return factory.score("Test Score", "J.S. Bach", [p]);
}

describe("MusicXML Export", () => {
  it("should produce valid XML structure", () => {
    const score = makeSimpleScore();
    const xml = exportToMusicXML(score);

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml).toContain("</score-partwise>");
    expect(xml).toContain("<part-list>");
    expect(xml).toContain("<score-part");
    expect(xml).toContain("<part-name>Piano</part-name>");
  });

  it("should export title and composer", () => {
    const score = makeSimpleScore();
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<work-title>Test Score</work-title>");
    expect(xml).toContain('<creator type="composer">J.S. Bach</creator>');
  });

  it("should export notes with correct pitches", () => {
    const score = makeSimpleScore();
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<step>C</step>");
    expect(xml).toContain("<step>D</step>");
    expect(xml).toContain("<step>E</step>");
    expect(xml).toContain("<octave>4</octave>");
  });

  it("should export durations correctly", () => {
    const score = makeSimpleScore();
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<type>quarter</type>");
    expect(xml).toContain("<type>half</type>");
  });

  it("should export rests", () => {
    const r = factory.rest(factory.dur("whole"));
    const v = factory.voice([r]);
    const m = factory.measure([v]);
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Rest Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<rest/>");
    expect(xml).toContain("<type>whole</type>");
  });

  it("should export dotted notes", () => {
    const n = factory.note("C", 4, factory.dur("quarter", 1));
    const v = factory.voice([n]);
    const m = factory.measure([v]);
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Dot Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<dot/>");
  });

  it("should export accidentals", () => {
    const n = factory.note("F", 4, factory.dur("quarter"), "sharp");
    const v = factory.voice([n]);
    const m = factory.measure([v]);
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Accidental Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<alter>1</alter>");
    expect(xml).toContain("<accidental>sharp</accidental>");
  });

  it("should export ties", () => {
    const n = factory.note("C", 4, factory.dur("quarter"));
    n.head.tied = true;
    const v = factory.voice([n]);
    const m = factory.measure([v]);
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Tie Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tied type="start"/>');
  });

  it("should export chords with <chord/> tags", () => {
    const heads = [
      factory.noteHead("C", 4),
      factory.noteHead("E", 4),
      factory.noteHead("G", 4),
    ];
    const ch = factory.chord(heads, factory.dur("quarter"));
    const v = factory.voice([ch]);
    const m = factory.measure([v]);
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Chord Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<chord/>");
    expect(xml).toContain("<step>C</step>");
    expect(xml).toContain("<step>E</step>");
    expect(xml).toContain("<step>G</step>");
  });

  it("should export chord symbols as harmony", () => {
    const rest = factory.rest(factory.dur("whole"));
    const v = factory.voice([rest]);
    const m = factory.measure([v], {
      annotations: [
        { kind: "chord-symbol", text: "Cmaj7", beatOffset: 0, noteEventId: rest.id },
      ],
    });
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Harmony Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<harmony>");
    expect(xml).toContain("<root-step>C</root-step>");
    expect(xml).toContain('text="maj7"');
  });

  it("should export lyrics", () => {
    const n = factory.note("C", 4, factory.dur("quarter"));
    const v = factory.voice([n]);
    const m = factory.measure([v], {
      annotations: [
        {
          kind: "lyric",
          text: "Hel",
          noteEventId: n.id,
          syllableType: "begin",
          verseNumber: 1,
        },
      ],
    });
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Lyric Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<lyric");
    expect(xml).toContain("<syllabic>begin</syllabic>");
    expect(xml).toContain("<text>Hel</text>");
  });

  it("should export key signatures", () => {
    const v = factory.voice([factory.rest(factory.dur("whole"))]);
    const m = factory.measure([v], {
      keySignature: { fifths: 2, mode: "major" },
    });
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Key Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<fifths>2</fifths>");
    expect(xml).toContain("<mode>major</mode>");
  });

  it("should export time signatures", () => {
    const v = factory.voice([factory.rest(factory.dur("whole"))]);
    const m = factory.measure([v], {
      timeSignature: { numerator: 3, denominator: 4 },
    });
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Time Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<beats>3</beats>");
    expect(xml).toContain("<beat-type>4</beat-type>");
  });

  it("should export clefs", () => {
    const v = factory.voice([factory.rest(factory.dur("whole"))]);
    const m = factory.measure([v], { clef: { type: "bass" } });
    const p = factory.part("Test", "T", [m]);
    const score = factory.score("Clef Test", "", [p]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain("<sign>F</sign>");
    expect(xml).toContain("<line>4</line>");
  });
});

describe("MusicXML Import", () => {
  it("should parse a simple score", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Import Test</work-title></work>
  <identification><creator type="composer">Mozart</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);

    expect(score.title).toBe("Import Test");
    expect(score.composer).toBe("Mozart");
    expect(score.parts).toHaveLength(1);
    expect(score.parts[0].name).toBe("Violin");
    expect(score.parts[0].measures).toHaveLength(1);

    const measure = score.parts[0].measures[0];
    expect(measure.clef.type).toBe("treble");
    expect(measure.timeSignature.numerator).toBe(4);
    expect(measure.keySignature.fifths).toBe(0);

    const events = measure.voices[0].events;
    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("C");
      expect(events[0].head.pitch.octave).toBe(4);
      expect(events[0].duration.type).toBe("quarter");
    }
    if (events[2].kind === "note") {
      expect(events[2].head.pitch.pitchClass).toBe("E");
      expect(events[2].duration.type).toBe("half");
    }
  });

  it("should parse rests", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("rest");
    expect(events[0].duration.type).toBe("whole");
  });

  it("should parse chords", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <chord/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("chord");
    if (events[0].kind === "chord") {
      expect(events[0].heads).toHaveLength(3);
      expect(events[0].heads[0].pitch.pitchClass).toBe("C");
      expect(events[0].heads[1].pitch.pitchClass).toBe("E");
      expect(events[0].heads[2].pitch.pitchClass).toBe("G");
    }
  });

  it("should parse accidentals", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1920</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    const event = score.parts[0].measures[0].voices[0].events[0];
    expect(event.kind).toBe("note");
    if (event.kind === "note") {
      expect(event.head.pitch.accidental).toBe("sharp");
    }
  });

  it("should parse ties", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>960</duration>
        <type>half</type>
        <tie type="start"/>
        <voice>1</voice>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>960</duration>
        <type>half</type>
        <tie type="stop"/>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    if (events[0].kind === "note") {
      expect(events[0].head.tied).toBe(true);
    }
  });

  it("should parse dotted notes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>720</duration>
        <type>quarter</type>
        <dot/>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    const event = score.parts[0].measures[0].voices[0].events[0];
    expect(event.duration.type).toBe("quarter");
    expect(event.duration.dots).toBe(1);
  });

  it("should parse harmony elements as chord symbols", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <harmony>
        <root><root-step>C</root-step></root>
        <kind text="maj7">other</kind>
      </harmony>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    const annotations = score.parts[0].measures[0].annotations;
    const chords = annotations.filter((a) => a.kind === "chord-symbol");
    expect(chords).toHaveLength(1);
    expect(chords[0].kind === "chord-symbol" && chords[0].text).toBe("Cmaj7");
  });

  it("should parse lyrics", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration>
        <type>quarter</type>
        <voice>1</voice>
        <lyric number="1">
          <syllabic>begin</syllabic>
          <text>Hel</text>
        </lyric>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration>
        <type>quarter</type>
        <voice>1</voice>
        <lyric number="1">
          <syllabic>end</syllabic>
          <text>lo</text>
        </lyric>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    const annotations = score.parts[0].measures[0].annotations;
    const lyrics = annotations.filter((a) => a.kind === "lyric");
    expect(lyrics).toHaveLength(2);
    if (lyrics[0].kind === "lyric") {
      expect(lyrics[0].text).toBe("Hel");
      expect(lyrics[0].syllableType).toBe("begin");
    }
    if (lyrics[1].kind === "lyric") {
      expect(lyrics[1].text).toBe("lo");
      expect(lyrics[1].syllableType).toBe("end");
    }
  });

  it("should parse multi-part scores", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
    <score-part id="P2"><part-name>Cello</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>1920</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>1920</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    expect(score.parts).toHaveLength(2);
    expect(score.parts[0].name).toBe("Violin");
    expect(score.parts[1].name).toBe("Cello");
    expect(score.parts[0].measures[0].clef.type).toBe("treble");
    expect(score.parts[1].measures[0].clef.type).toBe("bass");
  });
});

describe("MusicXML Round-trip", () => {
  it("should preserve musical content through export then import", () => {
    const original = makeSimpleScore();
    const xml = exportToMusicXML(original);
    const imported = importFromMusicXML(xml);

    expect(imported.title).toBe(original.title);
    expect(imported.composer).toBe(original.composer);
    expect(imported.parts).toHaveLength(original.parts.length);

    const origPart = original.parts[0];
    const impPart = imported.parts[0];
    expect(impPart.name).toBe(origPart.name);
    expect(impPart.measures).toHaveLength(origPart.measures.length);

    const origEvents = origPart.measures[0].voices[0].events;
    const impEvents = impPart.measures[0].voices[0].events;
    expect(impEvents).toHaveLength(origEvents.length);

    for (let i = 0; i < origEvents.length; i++) {
      expect(impEvents[i].kind).toBe(origEvents[i].kind);
      expect(impEvents[i].duration.type).toBe(origEvents[i].duration.type);
      expect(impEvents[i].duration.dots).toBe(origEvents[i].duration.dots);

      if (origEvents[i].kind === "note" && impEvents[i].kind === "note") {
        const origNote = origEvents[i] as { kind: "note"; head: { pitch: { pitchClass: string; octave: number; accidental: string } } };
        const impNote = impEvents[i] as { kind: "note"; head: { pitch: { pitchClass: string; octave: number; accidental: string } } };
        expect(impNote.head.pitch.pitchClass).toBe(origNote.head.pitch.pitchClass);
        expect(impNote.head.pitch.octave).toBe(origNote.head.pitch.octave);
        expect(impNote.head.pitch.accidental).toBe(origNote.head.pitch.accidental);
      }
    }
  });

  it("should round-trip chord symbols", () => {
    const n = factory.rest(factory.dur("whole"));
    const v = factory.voice([n]);
    const m = factory.measure([v], {
      annotations: [
        { kind: "chord-symbol", text: "Dm7", beatOffset: 0, noteEventId: n.id },
      ],
    });
    const p = factory.part("Lead", "Ld", [m]);
    const original = factory.score("Chord RT", "Test", [p]);

    const xml = exportToMusicXML(original);
    const imported = importFromMusicXML(xml);

    const chords = imported.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "chord-symbol"
    );
    expect(chords).toHaveLength(1);
    if (chords[0].kind === "chord-symbol") {
      expect(chords[0].text).toBe("Dm7");
    }
  });

  it("should round-trip lyrics", () => {
    const n1 = factory.note("C", 4, factory.dur("quarter"));
    const n2 = factory.note("D", 4, factory.dur("quarter"));
    const v = factory.voice([n1, n2]);
    const m = factory.measure([v], {
      annotations: [
        {
          kind: "lyric",
          text: "Hel",
          noteEventId: n1.id,
          syllableType: "begin" as const,
          verseNumber: 1,
        },
        {
          kind: "lyric",
          text: "lo",
          noteEventId: n2.id,
          syllableType: "end" as const,
          verseNumber: 1,
        },
      ],
    });
    const p = factory.part("Voice", "V", [m]);
    const original = factory.score("Lyric RT", "Test", [p]);

    const xml = exportToMusicXML(original);
    const imported = importFromMusicXML(xml);

    const lyrics = imported.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "lyric"
    );
    expect(lyrics).toHaveLength(2);
    if (lyrics[0].kind === "lyric" && lyrics[1].kind === "lyric") {
      expect(lyrics[0].text).toBe("Hel");
      expect(lyrics[0].syllableType).toBe("begin");
      expect(lyrics[1].text).toBe("lo");
      expect(lyrics[1].syllableType).toBe("end");
    }
  });

  it("should round-trip multi-part scores", () => {
    const v1 = factory.voice([factory.note("E", 5, factory.dur("whole"))]);
    const m1 = factory.measure([v1]);
    const p1 = factory.part("Violin", "Vln", [m1]);

    const v2 = factory.voice([factory.note("C", 3, factory.dur("whole"))]);
    const m2 = factory.measure([v2], { clef: { type: "bass" } });
    const p2 = factory.part("Cello", "Vc", [m2]);

    const original = factory.score("Multi-part", "Composer", [p1, p2]);
    const xml = exportToMusicXML(original);
    const imported = importFromMusicXML(xml);

    expect(imported.parts).toHaveLength(2);
    expect(imported.parts[0].name).toBe("Violin");
    expect(imported.parts[1].name).toBe("Cello");
    expect(imported.parts[0].measures[0].clef.type).toBe("treble");
    expect(imported.parts[1].measures[0].clef.type).toBe("bass");

    const ev1 = imported.parts[0].measures[0].voices[0].events[0];
    expect(ev1.kind).toBe("note");
    if (ev1.kind === "note") {
      expect(ev1.head.pitch.pitchClass).toBe("E");
      expect(ev1.head.pitch.octave).toBe(5);
    }

    const ev2 = imported.parts[1].measures[0].voices[0].events[0];
    expect(ev2.kind).toBe("note");
    if (ev2.kind === "note") {
      expect(ev2.head.pitch.pitchClass).toBe("C");
      expect(ev2.head.pitch.octave).toBe(3);
    }
  });

  it("should round-trip dynamics", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="below">
        <direction-type><dynamics><f/></dynamics></direction-type>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><type>quarter</type><voice>1</voice>
      </note>
      <direction placement="below">
        <direction-type><dynamics><pp/></dynamics></direction-type>
      </direction>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration><type>quarter</type><voice>1</voice>
      </note>
      <note><rest/><duration>960</duration><type>half</type><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = importFromMusicXML(xml);
    const annotations = imported.parts[0].measures[0].annotations;
    const dynamics = annotations.filter((a) => a.kind === "dynamic");
    expect(dynamics).toHaveLength(2);
    expect(dynamics[0].kind === "dynamic" && dynamics[0].level).toBe("f");
    expect(dynamics[1].kind === "dynamic" && dynamics[1].level).toBe("pp");

    // Re-export and re-import
    const reExported = exportToMusicXML(imported);
    expect(reExported).toContain("<dynamics>");
    expect(reExported).toContain("<f/>");
    expect(reExported).toContain("<pp/>");

    const reimported = importFromMusicXML(reExported);
    const reimportedDyn = reimported.parts[0].measures[0].annotations.filter((a) => a.kind === "dynamic");
    expect(reimportedDyn).toHaveLength(2);
    expect(reimportedDyn[0].kind === "dynamic" && reimportedDyn[0].level).toBe("f");
    expect(reimportedDyn[1].kind === "dynamic" && reimportedDyn[1].level).toBe("pp");
  });

  it("should round-trip hairpins (crescendo/diminuendo)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="below">
        <direction-type><wedge type="crescendo"/></direction-type>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><type>quarter</type><voice>1</voice>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration><type>quarter</type><voice>1</voice>
      </note>
      <direction placement="below">
        <direction-type><wedge type="stop"/></direction-type>
      </direction>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>480</duration><type>quarter</type><voice>1</voice>
      </note>
      <note><rest/><duration>480</duration><type>quarter</type><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = importFromMusicXML(xml);
    const annotations = imported.parts[0].measures[0].annotations;
    const hairpins = annotations.filter((a) => a.kind === "hairpin");
    expect(hairpins).toHaveLength(1);
    if (hairpins[0].kind === "hairpin") {
      expect(hairpins[0].type).toBe("crescendo");
      // startEventId should be different from endEventId
      expect(hairpins[0].startEventId).not.toBe(hairpins[0].endEventId);
    }

    // Re-export and check wedge elements
    const reExported = exportToMusicXML(imported);
    expect(reExported).toContain('<wedge type="crescendo"/>');
    expect(reExported).toContain('<wedge type="stop"/>');
  });

  it("should round-trip slurs", () => {
    const n1 = factory.note("C", 4, factory.dur("quarter"));
    const n2 = factory.note("E", 4, factory.dur("quarter"));
    const n3 = factory.note("G", 4, factory.dur("half"));
    const v = factory.voice([n1, n2, n3]);
    const m = factory.measure([v], {
      annotations: [
        {
          kind: "slur",
          startEventId: n1.id,
          endEventId: n2.id,
        },
      ],
    });
    const p = factory.part("Piano", "Pno", [m]);
    const original = factory.score("Slur Test", "Test", [p]);

    const xml = exportToMusicXML(original);
    expect(xml).toContain('<slur type="start"/>');
    expect(xml).toContain('<slur type="stop"/>');

    const imported = importFromMusicXML(xml);
    const slurs = imported.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "slur"
    );
    expect(slurs).toHaveLength(1);
    if (slurs[0].kind === "slur") {
      expect(slurs[0].startEventId).not.toBe(slurs[0].endEventId);
    }

    // Re-export should still contain slur elements
    const reExported = exportToMusicXML(imported);
    expect(reExported).toContain('<slur type="start"/>');
    expect(reExported).toContain('<slur type="stop"/>');
  });

  it("should import slurs from MusicXML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><type>quarter</type><voice>1</voice>
        <notations><slur type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration><type>quarter</type><voice>1</voice>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>480</duration><type>quarter</type><voice>1</voice>
        <notations><slur type="stop" number="1"/></notations>
      </note>
      <note><rest/><duration>480</duration><type>quarter</type><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = importFromMusicXML(xml);
    const annotations = imported.parts[0].measures[0].annotations;
    const slurs = annotations.filter((a) => a.kind === "slur");
    expect(slurs).toHaveLength(1);
    if (slurs[0].kind === "slur") {
      // The slur should span from the first note to the third note
      const events = imported.parts[0].measures[0].voices[0].events;
      expect(slurs[0].startEventId).toBe(events[0].id);
      expect(slurs[0].endEventId).toBe(events[2].id);
    }
  });

  it("should import sfz and fp dynamics", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="below">
        <direction-type><dynamics><sfz/></dynamics></direction-type>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>960</duration><type>half</type><voice>1</voice>
      </note>
      <direction placement="below">
        <direction-type><dynamics><fp/></dynamics></direction-type>
      </direction>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration><type>half</type><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const imported = importFromMusicXML(xml);
    const dynamics = imported.parts[0].measures[0].annotations.filter((a) => a.kind === "dynamic");
    expect(dynamics).toHaveLength(2);
    expect(dynamics[0].kind === "dynamic" && dynamics[0].level).toBe("sfz");
    expect(dynamics[1].kind === "dynamic" && dynamics[1].level).toBe("fp");
  });

  it("should round-trip rehearsal marks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type><rehearsal>A</rehearsal></direction-type>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><type>whole</type><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const imported = importFromMusicXML(xml);
    const rehearsals = imported.parts[0].measures[0].annotations.filter((a) => a.kind === "rehearsal-mark");
    expect(rehearsals).toHaveLength(1);
    expect(rehearsals[0].kind === "rehearsal-mark" && rehearsals[0].text).toBe("A");

    // Re-export and verify
    const reExported = exportToMusicXML(imported);
    expect(reExported).toContain("<rehearsal>A</rehearsal>");

    // Re-import and verify round-trip
    const reimported = importFromMusicXML(reExported);
    const reimportedR = reimported.parts[0].measures[0].annotations.filter((a) => a.kind === "rehearsal-mark");
    expect(reimportedR).toHaveLength(1);
    expect(reimportedR[0].kind === "rehearsal-mark" && reimportedR[0].text).toBe("A");
  });

  it("should round-trip tempo marks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <words>Allegro</words>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>140</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="140"/>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><type>whole</type><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const imported = importFromMusicXML(xml);
    const tempos = imported.parts[0].measures[0].annotations.filter((a) => a.kind === "tempo-mark");
    expect(tempos).toHaveLength(1);
    if (tempos[0].kind === "tempo-mark") {
      expect(tempos[0].bpm).toBe(140);
      expect(tempos[0].beatUnit).toBe("quarter");
      expect(tempos[0].text).toBe("Allegro");
    }

    // Re-export and verify
    const reExported = exportToMusicXML(imported);
    expect(reExported).toContain("<per-minute>140</per-minute>");
    expect(reExported).toContain("<beat-unit>quarter</beat-unit>");
    expect(reExported).toContain("Allegro");
  });

  it("should import part abbreviation from part-abbreviation element", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Violin I</part-name>
      <part-abbreviation>Vln. I</part-abbreviation>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>1920</duration><type>whole</type><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = importFromMusicXML(xml);
    expect(imported.parts[0].name).toBe("Violin I");
    expect(imported.parts[0].abbreviation).toBe("Vln. I");
  });

  it("should round-trip articulations", () => {
    const n1 = factory.note("C", 4, factory.dur("quarter"));
    n1.articulations = [{ kind: "staccato" }, { kind: "accent" }];
    const n2 = factory.note("D", 4, factory.dur("quarter"));
    n2.articulations = [{ kind: "fermata" }];
    const n3 = factory.note("E", 4, factory.dur("half"));
    n3.articulations = [{ kind: "trill" }];
    const m = factory.measure([factory.voice([n1, n2, n3])]);
    const s = factory.score("Test", "", [factory.part("Piano", "Pno", [m])]);

    const xml = exportToMusicXML(s);
    expect(xml).toContain("<staccato/>");
    expect(xml).toContain("<accent/>");
    expect(xml).toContain("<fermata/>");
    expect(xml).toContain("<trill-mark/>");

    const reimported = importFromMusicXML(xml);
    const events = reimported.parts[0].measures[0].voices[0].events;
    expect(events[0].kind === "note" && events[0].articulations).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "staccato" }), expect.objectContaining({ kind: "accent" })])
    );
    expect(events[1].kind === "note" && events[1].articulations).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "fermata" })])
    );
    expect(events[2].kind === "note" && events[2].articulations).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "trill" })])
    );
  });

  it("should round-trip grace notes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <key><fifths>0</fifths></key>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <grace slash="yes"/>
        <pitch><step>B</step><octave>3</octave></pitch>
        <type>eighth</type><voice>1</voice>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><type>whole</type><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const imported = importFromMusicXML(xml);
    const events = imported.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("grace");
    if (events[0].kind === "grace") {
      expect(events[0].head.pitch.pitchClass).toBe("B");
      expect(events[0].slash).toBe(true);
    }

    // Re-export and verify
    const reExported = exportToMusicXML(imported);
    expect(reExported).toContain('<grace slash="yes"/>');

    const reimported = importFromMusicXML(reExported);
    expect(reimported.parts[0].measures[0].voices[0].events[0].kind).toBe("grace");
  });

  it("should round-trip navigation marks (segno, coda, fine)", () => {
    const m1 = factory.measure([factory.voice([factory.note("C", 4, factory.dur("whole"))])]);
    m1.navigation = { segno: true };
    const m2 = factory.measure([factory.voice([factory.note("D", 4, factory.dur("whole"))])]);
    m2.navigation = { fine: true, dsText: "D.S. al Fine" };
    const s = factory.score("Test", "", [factory.part("Piano", "Pno", [m1, m2])]);

    const xml = exportToMusicXML(s);
    expect(xml).toContain("<segno/>");
    expect(xml).toContain("Fine");
    expect(xml).toContain("D.S. al Fine");

    const reimported = importFromMusicXML(xml);
    expect(reimported.parts[0].measures[0].navigation?.segno).toBe(true);
    expect(reimported.parts[0].measures[1].navigation?.fine).toBe(true);
    expect(reimported.parts[0].measures[1].navigation?.dsText).toBe("D.S. al Fine");
  });

  it("should export tie stops for consecutive tied notes", () => {
    const n1 = factory.note("C", 4, factory.dur("quarter"));
    n1.head.tied = true;
    const n2 = factory.note("C", 4, factory.dur("quarter"));
    const v = factory.voice([n1, n2]);
    const m = factory.measure([v]);
    const score = factory.score("Tie Test", "", [factory.part("Piano", "Pno", [m])]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
    expect(xml).toContain('<tied type="start"/>');
    expect(xml).toContain('<tied type="stop"/>');
  });

  it("should export chord symbol kinds correctly instead of other", () => {
    const n = factory.note("C", 4, factory.dur("whole"));
    const m = factory.measure([factory.voice([n])], {
      annotations: [
        { kind: "chord-symbol", text: "Cm7", beatOffset: 0, noteEventId: n.id },
      ],
    });
    const score = factory.score("Test", "", [factory.part("Piano", "Pno", [m])]);
    const xml = exportToMusicXML(score);

    expect(xml).toContain(">minor-seventh<");
    expect(xml).not.toContain(">other<");
  });

  it("should round-trip chord symbol kinds through export/import", () => {
    const n = factory.note("D", 4, factory.dur("whole"));
    const m = factory.measure([factory.voice([n])], {
      annotations: [
        { kind: "chord-symbol", text: "Ddim7", beatOffset: 0, noteEventId: n.id },
      ],
    });
    const score = factory.score("Test", "", [factory.part("Piano", "Pno", [m])]);
    const xml = exportToMusicXML(score);
    expect(xml).toContain(">diminished-seventh<");

    const reimported = importFromMusicXML(xml);
    const chords = reimported.parts[0].measures[0].annotations.filter(
      (a: any) => a.kind === "chord-symbol"
    );
    expect(chords.length).toBe(1);
    expect(chords[0].text).toContain("D");
  });

  it("should round-trip volta brackets", () => {
    const m1 = factory.measure([factory.voice([factory.note("C", 4, factory.dur("whole"))])]);
    m1.navigation = { volta: { endings: [1], label: "1." } };
    m1.barlineEnd = "repeat-end";
    const m2 = factory.measure([factory.voice([factory.note("D", 4, factory.dur("whole"))])]);
    m2.navigation = { volta: { endings: [2], label: "2." } };
    const s = factory.score("Test", "", [factory.part("Piano", "Pno", [m1, m2])]);

    const xml = exportToMusicXML(s);
    expect(xml).toContain('ending number="1"');
    expect(xml).toContain('ending number="2"');

    const reimported = importFromMusicXML(xml);
    expect(reimported.parts[0].measures[0].navigation?.volta?.endings).toEqual([1]);
    expect(reimported.parts[0].measures[1].navigation?.volta?.endings).toEqual([2]);
  });
});
