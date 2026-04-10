import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { durationToTicks, voiceTicksUsed } from "../duration";
import { factory } from "..";
import { serialize, deserialize } from "../../serialization";
import { importFromMusicXML } from "../../musicxml/import";
import { exportToMusicXML } from "../../musicxml/export";
import type { Note, Rest, TupletRatio } from "../note";

beforeAll(() => {
  if (typeof globalThis.DOMParser === "undefined") {
    const jsdom = new JSDOM();
    globalThis.DOMParser = jsdom.window.DOMParser;
  }
});

const triplet: TupletRatio = { actual: 3, normal: 2 };
const quintuplet: TupletRatio = { actual: 5, normal: 4 };

describe("tuplet duration ticks", () => {
  it("scales quarter-note triplet correctly (3 in the space of 2)", () => {
    // A quarter-note triplet: 3 quarters fit in 2 quarter beats
    // Normal quarter = 480 ticks. Tuplet quarter = 480 * 2/3 = 320
    expect(durationToTicks({ type: "quarter", dots: 0 }, triplet)).toBe(320);
  });

  it("scales eighth-note triplet correctly", () => {
    // Normal eighth = 240. Tuplet eighth = 240 * 2/3 = 160
    expect(durationToTicks({ type: "eighth", dots: 0 }, triplet)).toBe(160);
  });

  it("scales quintuplet correctly (5 in the space of 4)", () => {
    // Normal eighth = 240. Quintuplet eighth = 240 * 4/5 = 192
    expect(durationToTicks({ type: "eighth", dots: 0 }, quintuplet)).toBe(192);
  });

  it("returns normal ticks when no tuplet", () => {
    expect(durationToTicks({ type: "quarter", dots: 0 })).toBe(480);
    expect(durationToTicks({ type: "quarter", dots: 0 }, undefined)).toBe(480);
  });

  it("handles dotted tuplet notes", () => {
    // Dotted quarter = 720. Triplet dotted quarter = 720 * 2/3 = 480
    expect(durationToTicks({ type: "quarter", dots: 1 }, triplet)).toBe(480);
  });
});

describe("voiceTicksUsed with tuplets", () => {
  it("calculates total ticks for a triplet group", () => {
    // 3 triplet eighths = 3 * 160 = 480 ticks (= one quarter note)
    const events = [
      { duration: { type: "eighth" as const, dots: 0 as const }, tuplet: triplet },
      { duration: { type: "eighth" as const, dots: 0 as const }, tuplet: triplet },
      { duration: { type: "eighth" as const, dots: 0 as const }, tuplet: triplet },
    ];
    expect(voiceTicksUsed(events)).toBe(480);
  });

  it("calculates mixed regular and tuplet events", () => {
    // quarter (480) + 3 triplet eighths (480) = 960
    const events = [
      { duration: { type: "quarter" as const, dots: 0 as const } },
      { duration: { type: "eighth" as const, dots: 0 as const }, tuplet: triplet },
      { duration: { type: "eighth" as const, dots: 0 as const }, tuplet: triplet },
      { duration: { type: "eighth" as const, dots: 0 as const }, tuplet: triplet },
    ];
    expect(voiceTicksUsed(events)).toBe(960);
  });

  it("3 quarter-note triplets fill a half note", () => {
    // 3 triplet quarters = 3 * 320 = 960 = half note
    const events = [
      { duration: { type: "quarter" as const, dots: 0 as const }, tuplet: triplet },
      { duration: { type: "quarter" as const, dots: 0 as const }, tuplet: triplet },
      { duration: { type: "quarter" as const, dots: 0 as const }, tuplet: triplet },
    ];
    expect(voiceTicksUsed(events)).toBe(960);
  });
});

describe("tuplet JSON serialization", () => {
  it("round-trips tuplet notes", () => {
    const n1 = factory.note("C", 4, factory.dur("eighth"));
    (n1 as Note).tuplet = triplet;
    const n2 = factory.note("D", 4, factory.dur("eighth"));
    (n2 as Note).tuplet = triplet;
    const n3 = factory.note("E", 4, factory.dur("eighth"));
    (n3 as Note).tuplet = triplet;

    const s = factory.score("Triplet Test", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([n1, n2, n3, factory.rest(factory.dur("quarter.".includes(".") ? "quarter" : "quarter"))]),
        ]),
      ]),
    ]);

    const text = serialize(s);
    const json = JSON.parse(text);

    // Verify tuplet is in the JSON
    const events = json.parts[0].measures[0].voices[0].events;
    expect(events[0].tuplet).toEqual({ actual: 3, normal: 2 });
    expect(events[1].tuplet).toEqual({ actual: 3, normal: 2 });
    expect(events[2].tuplet).toEqual({ actual: 3, normal: 2 });
    expect(events[3].tuplet).toBeUndefined();

    // Round-trip
    const parsed = deserialize(text);
    const parsedEvents = parsed.parts[0].measures[0].voices[0].events;
    expect((parsedEvents[0] as Note).tuplet).toEqual({ actual: 3, normal: 2 });
    expect((parsedEvents[1] as Note).tuplet).toEqual({ actual: 3, normal: 2 });
    expect((parsedEvents[2] as Note).tuplet).toEqual({ actual: 3, normal: 2 });
    expect((parsedEvents[3] as Rest).tuplet).toBeUndefined();
  });

  it("round-trips tuplet rests", () => {
    const r = factory.rest(factory.dur("eighth"));
    (r as Rest).tuplet = triplet;

    const s = factory.score("Rest Tuplet", "", [
      factory.part("P", "P", [
        factory.measure([factory.voice([r])]),
      ]),
    ]);

    const text = serialize(s);
    const parsed = deserialize(text);
    expect((parsed.parts[0].measures[0].voices[0].events[0] as Rest).tuplet).toEqual({ actual: 3, normal: 2 });
  });
});

describe("tuplet MusicXML export", () => {
  it("exports time-modification for tuplet notes", () => {
    const n1 = factory.note("C", 4, factory.dur("eighth"));
    (n1 as Note).tuplet = triplet;
    const n2 = factory.note("D", 4, factory.dur("eighth"));
    (n2 as Note).tuplet = triplet;
    const n3 = factory.note("E", 4, factory.dur("eighth"));
    (n3 as Note).tuplet = triplet;

    const s = factory.score("Triplet", "", [
      factory.part("P", "P", [
        factory.measure([factory.voice([n1, n2, n3])]),
      ]),
    ]);

    const xml = exportToMusicXML(s);

    // Should contain time-modification elements
    expect(xml).toContain("<time-modification>");
    expect(xml).toContain("<actual-notes>3</actual-notes>");
    expect(xml).toContain("<normal-notes>2</normal-notes>");

    // Should have tuplet start on first and stop on last
    expect(xml).toContain('<tuplet type="start"/>');
    expect(xml).toContain('<tuplet type="stop"/>');

    // Duration should be scaled: eighth = 240, triplet eighth = 160
    expect(xml).toContain("<duration>160</duration>");
  });
});

describe("tuplet MusicXML import", () => {
  it("parses time-modification from MusicXML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Part</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>160</duration>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
        </time-modification>
        <voice>1</voice>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>160</duration>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
        </time-modification>
        <voice>1</voice>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>160</duration>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
        </time-modification>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = importFromMusicXML(xml);
    const events = score.parts[0].measures[0].voices[0].events;

    expect(events).toHaveLength(3);
    expect((events[0] as Note).tuplet).toEqual({ actual: 3, normal: 2 });
    expect((events[1] as Note).tuplet).toEqual({ actual: 3, normal: 2 });
    expect((events[2] as Note).tuplet).toEqual({ actual: 3, normal: 2 });
  });

  it("round-trips tuplets through MusicXML export/import", () => {
    const n1 = factory.note("C", 4, factory.dur("eighth"));
    (n1 as Note).tuplet = triplet;
    const n2 = factory.note("D", 4, factory.dur("eighth"));
    (n2 as Note).tuplet = triplet;
    const n3 = factory.note("E", 4, factory.dur("eighth"));
    (n3 as Note).tuplet = triplet;

    const original = factory.score("Tuplet RT", "", [
      factory.part("P", "P", [
        factory.measure([factory.voice([n1, n2, n3])]),
      ]),
    ]);

    const xml = exportToMusicXML(original);
    const imported = importFromMusicXML(xml);
    const events = imported.parts[0].measures[0].voices[0].events;

    expect(events).toHaveLength(3);
    for (const e of events) {
      expect((e as Note).tuplet).toEqual({ actual: 3, normal: 2 });
    }
  });
});
