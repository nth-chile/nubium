import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { importFromMusicXML } from "../import";

beforeAll(() => {
  if (typeof globalThis.DOMParser === "undefined") {
    const jsdom = new JSDOM();
    globalThis.DOMParser = jsdom.window.DOMParser;
  }
});

const SLASH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><notehead>slash</notehead></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><notehead>slash</notehead></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><notehead>slash</notehead></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><notehead>slash</notehead></note>
    </measure>
  </part>
</score-partwise>`;

const SLASH_WITH_HARMONY = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <harmony><root><root-step>G</root-step></root><kind text="maj7">major-seventh</kind></harmony>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>8</duration><type>half</type><notehead>slash</notehead></note>
      <harmony><root><root-step>C</root-step></root><kind text="7">dominant</kind></harmony>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>8</duration><type>half</type><notehead>slash</notehead></note>
    </measure>
  </part>
</score-partwise>`;

describe("slash import", () => {
  it("imports notehead=slash as slash events", () => {
    const score = importFromMusicXML(SLASH_XML);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events.length).toBe(4);
    expect(events.every(e => e.kind === "slash")).toBe(true);
  });

  it("imports harmony elements as chord symbols on slash notes", () => {
    const score = importFromMusicXML(SLASH_WITH_HARMONY);
    const m = score.parts[0].measures[0];
    const events = m.voices[0].events;
    expect(events.length).toBe(2);
    expect(events.every(e => e.kind === "slash")).toBe(true);
    const chords = m.annotations.filter((a: any) => a.kind === "chord-symbol");
    expect(chords.length).toBe(2);
    expect((chords[0] as any).text).toBe("Gmaj7");
    expect((chords[1] as any).text).toBe("C7");
  });
});
