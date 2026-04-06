import { describe, it, expect } from "vitest";
import {
  scoreToAbc,
  scoreToLily,
  parseAbcToScore,
  parseLilyToScore,
  detectFormat,
  pitchToAbc,
  pitchToLily,
  eventToAbc,
  eventToLily,
} from "../builtins/Clipboard";
import { factory } from "../../model";
import type { Score } from "../../model";
import type { Pitch } from "../../model/pitch";
import type { Note, Rest, Chord, NoteEvent } from "../../model/note";
import { newId } from "../../model/ids";
import type { NoteEventId } from "../../model/ids";

// --- Helpers ---

function makePitch(
  pitchClass: Pitch["pitchClass"],
  octave: Pitch["octave"],
  accidental: Pitch["accidental"] = "natural"
): Pitch {
  return { pitchClass, accidental, octave };
}

function makeNote(
  pitchClass: Pitch["pitchClass"],
  octave: Pitch["octave"],
  durationType: string = "quarter",
  accidental: Pitch["accidental"] = "natural",
  dots: 0 | 1 = 0
): Note {
  return {
    kind: "note",
    id: newId<NoteEventId>("evt"),
    duration: { type: durationType as any, dots },
    head: { pitch: makePitch(pitchClass, octave, accidental) },
  };
}

function makeRest(durationType: string = "quarter"): Rest {
  return {
    kind: "rest",
    id: newId<NoteEventId>("evt"),
    duration: { type: durationType as any, dots: 0 },
  };
}

function makeChord(
  pitches: Array<{ pitchClass: Pitch["pitchClass"]; octave: Pitch["octave"]; accidental?: Pitch["accidental"] }>,
  durationType: string = "quarter"
): Chord {
  return {
    kind: "chord",
    id: newId<NoteEventId>("evt"),
    duration: { type: durationType as any, dots: 0 },
    heads: pitches.map((p) => ({
      pitch: makePitch(p.pitchClass, p.octave, p.accidental ?? "natural"),
    })),
  };
}

function makeScore(events: NoteEvent[], title = "Test", tempo = 120): Score {
  const score = factory.score(
    title,
    "Composer",
    [factory.part("Piano", "Pno.", [factory.measure([factory.voice(events)])])],
    tempo
  );
  return score;
}

// --- pitchToAbc ---

describe("pitchToAbc", () => {
  it("converts C4 (middle C) to uppercase C", () => {
    expect(pitchToAbc(makePitch("C", 4))).toBe("C");
  });

  it("converts C5 to lowercase c", () => {
    expect(pitchToAbc(makePitch("C", 5))).toBe("c");
  });

  it("converts C3 to C,", () => {
    expect(pitchToAbc(makePitch("C", 3))).toBe("C,");
  });

  it("converts C6 to c'", () => {
    expect(pitchToAbc(makePitch("C", 6))).toBe("c'");
  });

  it("converts C2 to C,,", () => {
    expect(pitchToAbc(makePitch("C", 2))).toBe("C,,");
  });

  it("converts sharp to ^", () => {
    expect(pitchToAbc(makePitch("F", 4, "sharp"))).toBe("^F");
  });

  it("converts flat to _", () => {
    expect(pitchToAbc(makePitch("B", 4, "flat"))).toBe("_B");
  });

  it("converts double-sharp to ^^", () => {
    expect(pitchToAbc(makePitch("C", 5, "double-sharp"))).toBe("^^c");
  });

  it("converts double-flat to __", () => {
    expect(pitchToAbc(makePitch("E", 5, "double-flat"))).toBe("__e");
  });
});

// --- pitchToLily ---

describe("pitchToLily", () => {
  it("converts C4 (middle C) to c (no octave marks, lilypond c' = C4 starts at octave 4)", () => {
    // LilyPond: c' = C4, but pitchToLily: octave >= 4, adds (octave-4) primes
    // C4 -> c (0 primes)
    expect(pitchToLily(makePitch("C", 4))).toBe("c");
  });

  it("converts C5 to c'", () => {
    expect(pitchToLily(makePitch("C", 5))).toBe("c'");
  });

  it("converts C3 to c,", () => {
    expect(pitchToLily(makePitch("C", 3))).toBe("c,");
  });

  it("converts C2 to c,,", () => {
    expect(pitchToLily(makePitch("C", 2))).toBe("c,,");
  });

  it("converts sharp to 'is' suffix", () => {
    expect(pitchToLily(makePitch("F", 4, "sharp"))).toBe("fis");
  });

  it("converts flat to 'es' suffix", () => {
    expect(pitchToLily(makePitch("B", 4, "flat"))).toBe("bes");
  });

  it("converts double-sharp to 'isis'", () => {
    expect(pitchToLily(makePitch("C", 5, "double-sharp"))).toBe("cisis'");
  });

  it("converts double-flat to 'eses'", () => {
    expect(pitchToLily(makePitch("E", 3, "double-flat"))).toBe("eeses,");
  });
});

// --- eventToAbc ---

describe("eventToAbc", () => {
  it("converts a quarter note to pitch only (no duration suffix)", () => {
    expect(eventToAbc(makeNote("C", 4))).toBe("C");
  });

  it("converts a half note", () => {
    expect(eventToAbc(makeNote("D", 5, "half"))).toBe("d2");
  });

  it("converts a whole note", () => {
    expect(eventToAbc(makeNote("E", 4, "whole"))).toBe("E4");
  });

  it("converts an eighth note", () => {
    expect(eventToAbc(makeNote("G", 5, "eighth"))).toBe("g/2");
  });

  it("converts a rest", () => {
    expect(eventToAbc(makeRest("quarter"))).toBe("z");
  });

  it("converts a half rest", () => {
    expect(eventToAbc(makeRest("half"))).toBe("z2");
  });

  it("converts a dotted quarter note", () => {
    const n = makeNote("C", 4, "quarter", "natural", 1);
    expect(eventToAbc(n)).toBe("C>");
  });

  it("converts a chord", () => {
    const c = makeChord([
      { pitchClass: "C", octave: 4 },
      { pitchClass: "E", octave: 4 },
      { pitchClass: "G", octave: 4 },
    ]);
    expect(eventToAbc(c)).toBe("[CEG]");
  });
});

// --- eventToLily ---

describe("eventToLily", () => {
  it("converts a quarter note", () => {
    expect(eventToLily(makeNote("C", 4))).toBe("c4");
  });

  it("converts a half note", () => {
    expect(eventToLily(makeNote("D", 5, "half"))).toBe("d'2");
  });

  it("converts a whole note", () => {
    expect(eventToLily(makeNote("E", 4, "whole"))).toBe("e1");
  });

  it("converts an eighth note", () => {
    expect(eventToLily(makeNote("G", 5, "eighth"))).toBe("g'8");
  });

  it("converts a rest", () => {
    expect(eventToLily(makeRest("quarter"))).toBe("r4");
  });

  it("converts a dotted quarter note", () => {
    const n = makeNote("C", 4, "quarter", "natural", 1);
    expect(eventToLily(n)).toBe("c4.");
  });

  it("converts a chord", () => {
    const c = makeChord([
      { pitchClass: "C", octave: 4 },
      { pitchClass: "E", octave: 4 },
      { pitchClass: "G", octave: 4 },
    ]);
    expect(eventToLily(c)).toBe("<c e g>4");
  });
});

// --- scoreToAbc ---

describe("scoreToAbc", () => {
  it("produces valid ABC header fields", () => {
    const score = makeScore([makeNote("C", 4)], "My Song", 140);
    const abc = scoreToAbc(score);
    expect(abc).toContain("X:1");
    expect(abc).toContain("T:My Song");
    expect(abc).toContain("M:4/4");
    expect(abc).toContain("K:C");
    expect(abc).toContain("Q:1/4=140");
  });

  it("converts a measure with notes and rests", () => {
    const events: NoteEvent[] = [
      makeNote("C", 4),
      makeNote("D", 4),
      makeNote("E", 4),
      makeRest("quarter"),
    ];
    const abc = scoreToAbc(makeScore(events));
    const lastLine = abc.split("\n").pop()!;
    expect(lastLine).toBe("C D E z |]");
  });

  it("handles sharps and flats in notes", () => {
    const events: NoteEvent[] = [
      makeNote("F", 4, "quarter", "sharp"),
      makeNote("B", 4, "quarter", "flat"),
    ];
    const abc = scoreToAbc(makeScore(events));
    const lastLine = abc.split("\n").pop()!;
    expect(lastLine).toBe("^F _B |]");
  });
});

// --- scoreToLily ---

describe("scoreToLily", () => {
  it("produces valid LilyPond structure", () => {
    const score = makeScore([makeNote("C", 4)], "My Song", 140);
    const lily = scoreToLily(score);
    expect(lily).toContain('\\version "2.24.0"');
    expect(lily).toContain('title = "My Song"');
    expect(lily).toContain("\\tempo 4 = 140");
    expect(lily).toContain("\\new Staff {");
    expect(lily).toContain("\\time 4/4");
  });

  it("converts notes correctly", () => {
    const events: NoteEvent[] = [
      makeNote("C", 4),
      makeNote("D", 4),
      makeNote("E", 4),
      makeRest("quarter"),
    ];
    const lily = scoreToLily(makeScore(events));
    expect(lily).toContain("c4 d4 e4 r4");
  });
});

// --- detectFormat ---

describe("detectFormat", () => {
  it("detects ABC notation", () => {
    expect(detectFormat("X:1\nT:My Song\nM:4/4\nK:C\nCDEF|")).toBe("abc");
  });

  it("detects ABC from a header line", () => {
    expect(detectFormat("T: Some Title\nK:G\nGABc|")).toBe("abc");
  });

  it("detects LilyPond from \\version", () => {
    expect(detectFormat('\\version "2.24.0"\n\\new Staff { c4 }')).toBe("lilypond");
  });

  it("detects LilyPond from \\new Staff", () => {
    expect(detectFormat("\\new Staff { c4 d4 e4 }")).toBe("lilypond");
  });

  it("detects LilyPond from \\relative", () => {
    expect(detectFormat("\\relative c' { c d e f }")).toBe("lilypond");
  });

  it("detects MusicXML from <?xml", () => {
    expect(detectFormat('<?xml version="1.0"?><score-partwise></score-partwise>')).toBe("musicxml");
  });

  it("detects MusicXML from <score-partwise", () => {
    expect(detectFormat("<score-partwise></score-partwise>")).toBe("musicxml");
  });

  it("returns null for unknown text", () => {
    expect(detectFormat("just some random text")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectFormat("")).toBeNull();
  });
});

// --- parseAbcToScore ---

describe("parseAbcToScore", () => {
  it("parses title and tempo from ABC headers", () => {
    const abc = "X:1\nT:Test Song\nQ:1/4=140\nM:4/4\nK:C\nC D E F|";
    const score = parseAbcToScore(abc);
    expect(score.title).toBe("Test Song");
    expect(score.tempo).toBe(140);
  });

  it("parses notes from a single measure", () => {
    const abc = "X:1\nT:Test\nM:4/4\nK:C\nC D E F|";
    const score = parseAbcToScore(abc);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(4);
    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("C");
      expect(events[0].head.pitch.octave).toBe(4);
    }
  });

  it("parses lowercase notes as octave 5", () => {
    const abc = "X:1\nK:C\nc d e f|";
    const score = parseAbcToScore(abc);
    const events = score.parts[0].measures[0].voices[0].events;
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("C");
      expect(events[0].head.pitch.octave).toBe(5);
    }
  });

  it("parses rests", () => {
    const abc = "X:1\nK:C\nC z E z|";
    const score = parseAbcToScore(abc);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(4);
    expect(events[1].kind).toBe("rest");
    expect(events[3].kind).toBe("rest");
  });

  it("parses sharps and flats", () => {
    const abc = "X:1\nK:C\n^F _B ^^C __E|";
    const score = parseAbcToScore(abc);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(4);
    if (events[0].kind === "note") expect(events[0].head.pitch.accidental).toBe("sharp");
    if (events[1].kind === "note") expect(events[1].head.pitch.accidental).toBe("flat");
    if (events[2].kind === "note") expect(events[2].head.pitch.accidental).toBe("double-sharp");
    if (events[3].kind === "note") expect(events[3].head.pitch.accidental).toBe("double-flat");
  });

  it("parses half and eighth notes", () => {
    const abc = "X:1\nK:C\nC2 D/2|";
    const score = parseAbcToScore(abc);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].duration.type).toBe("half");
    expect(events[1].duration.type).toBe("eighth");
  });

  it("parses chords", () => {
    const abc = "X:1\nK:C\n[CEG] [DFA]|";
    const score = parseAbcToScore(abc);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("chord");
    if (events[0].kind === "chord") {
      expect(events[0].heads).toHaveLength(3);
      expect(events[0].heads[0].pitch.pitchClass).toBe("C");
      expect(events[0].heads[1].pitch.pitchClass).toBe("E");
      expect(events[0].heads[2].pitch.pitchClass).toBe("G");
    }
  });

  it("parses multiple measures", () => {
    const abc = "X:1\nK:C\nC D E F | G A B c |";
    const score = parseAbcToScore(abc);
    expect(score.parts[0].measures.length).toBe(2);
    expect(score.parts[0].measures[0].voices[0].events).toHaveLength(4);
    expect(score.parts[0].measures[1].voices[0].events).toHaveLength(4);
  });

  it("produces at least one empty measure for empty input", () => {
    const abc = "X:1\nK:C\n";
    const score = parseAbcToScore(abc);
    expect(score.parts[0].measures.length).toBeGreaterThanOrEqual(1);
  });
});

// --- Round-trip ---

describe("round-trip: score -> ABC -> parse", () => {
  it("preserves note pitches through round-trip", () => {
    const original = makeScore([
      makeNote("C", 4),
      makeNote("E", 4),
      makeNote("G", 4),
      makeRest("quarter"),
    ]);

    const abc = scoreToAbc(original);
    const parsed = parseAbcToScore(abc);

    const originalEvents = original.parts[0].measures[0].voices[0].events;
    const parsedEvents = parsed.parts[0].measures[0].voices[0].events;

    expect(parsedEvents).toHaveLength(originalEvents.length);

    // Check each note pitch
    for (let i = 0; i < originalEvents.length; i++) {
      expect(parsedEvents[i].kind).toBe(originalEvents[i].kind);
      if (originalEvents[i].kind === "note" && parsedEvents[i].kind === "note") {
        const origNote = originalEvents[i] as Note;
        const parsedNote = parsedEvents[i] as Note;
        expect(parsedNote.head.pitch.pitchClass).toBe(origNote.head.pitch.pitchClass);
        expect(parsedNote.head.pitch.octave).toBe(origNote.head.pitch.octave);
      }
    }
  });

  it("preserves title and tempo through round-trip", () => {
    const original = makeScore([makeNote("C", 4)], "Round Trip", 160);
    const abc = scoreToAbc(original);
    const parsed = parseAbcToScore(abc);

    expect(parsed.title).toBe("Round Trip");
    expect(parsed.tempo).toBe(160);
  });

  it("preserves sharps through round-trip", () => {
    const original = makeScore([
      makeNote("F", 4, "quarter", "sharp"),
      makeNote("C", 5, "quarter", "sharp"),
    ]);
    const abc = scoreToAbc(original);
    const parsed = parseAbcToScore(abc);
    const events = parsed.parts[0].measures[0].voices[0].events;

    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("F");
      expect(events[0].head.pitch.accidental).toBe("sharp");
    }
    if (events[1].kind === "note") {
      expect(events[1].head.pitch.pitchClass).toBe("C");
      expect(events[1].head.pitch.accidental).toBe("sharp");
      expect(events[1].head.pitch.octave).toBe(5);
    }
  });

  it("preserves chords through round-trip", () => {
    const original = makeScore([
      makeChord([
        { pitchClass: "C", octave: 4 },
        { pitchClass: "E", octave: 4 },
        { pitchClass: "G", octave: 4 },
      ]),
    ]);
    const abc = scoreToAbc(original);
    const parsed = parseAbcToScore(abc);
    const events = parsed.parts[0].measures[0].voices[0].events;

    expect(events[0].kind).toBe("chord");
    if (events[0].kind === "chord") {
      expect(events[0].heads).toHaveLength(3);
      expect(events[0].heads[0].pitch.pitchClass).toBe("C");
      expect(events[0].heads[1].pitch.pitchClass).toBe("E");
      expect(events[0].heads[2].pitch.pitchClass).toBe("G");
    }
  });

  it("preserves flats through round-trip", () => {
    const original = makeScore([
      makeNote("B", 4, "quarter", "flat"),
      makeNote("E", 5, "quarter", "flat"),
    ]);
    const abc = scoreToAbc(original);
    const parsed = parseAbcToScore(abc);
    const events = parsed.parts[0].measures[0].voices[0].events;

    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("B");
      expect(events[0].head.pitch.accidental).toBe("flat");
    }
    if (events[1].kind === "note") {
      expect(events[1].head.pitch.pitchClass).toBe("E");
      expect(events[1].head.pitch.accidental).toBe("flat");
      expect(events[1].head.pitch.octave).toBe(5);
    }
  });

  it("preserves durations through round-trip", () => {
    const original = makeScore([
      makeNote("C", 4, "half"),
      makeNote("D", 4, "eighth"),
      makeNote("E", 4, "whole"),
      makeNote("F", 4, "16th"),
    ]);
    const abc = scoreToAbc(original);
    const parsed = parseAbcToScore(abc);
    const events = parsed.parts[0].measures[0].voices[0].events;

    expect(events).toHaveLength(4);
    expect(events[0].duration.type).toBe("half");
    expect(events[1].duration.type).toBe("eighth");
    expect(events[2].duration.type).toBe("whole");
    expect(events[3].duration.type).toBe("16th");
  });

  it("preserves multiple measures through round-trip", () => {
    const score = factory.score(
      "Multi Measure",
      "Composer",
      [
        factory.part("Piano", "Pno.", [
          factory.measure([factory.voice([makeNote("C", 4), makeNote("D", 4)])]),
          factory.measure([factory.voice([makeNote("E", 4), makeNote("F", 4)])]),
        ]),
      ],
      120
    );
    const abc = scoreToAbc(score);
    const parsed = parseAbcToScore(abc);

    expect(parsed.parts[0].measures).toHaveLength(2);
    const m1events = parsed.parts[0].measures[0].voices[0].events;
    const m2events = parsed.parts[0].measures[1].voices[0].events;
    expect(m1events).toHaveLength(2);
    expect(m2events).toHaveLength(2);
    if (m1events[0].kind === "note") expect(m1events[0].head.pitch.pitchClass).toBe("C");
    if (m2events[0].kind === "note") expect(m2events[0].head.pitch.pitchClass).toBe("E");
  });

  it("preserves rests through round-trip", () => {
    const original = makeScore([
      makeNote("C", 4),
      makeRest("half"),
      makeNote("G", 4),
    ]);
    const abc = scoreToAbc(original);
    const parsed = parseAbcToScore(abc);
    const events = parsed.parts[0].measures[0].voices[0].events;

    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("note");
    expect(events[1].kind).toBe("rest");
    expect(events[1].duration.type).toBe("half");
    expect(events[2].kind).toBe("note");
  });
});

// --- LilyPond export: complex scores ---

describe("scoreToLily: complex scores", () => {
  it("exports multiple parts as separate staves", () => {
    const score = factory.score(
      "Duet",
      "Composer",
      [
        factory.part("Flute", "Fl.", [factory.measure([factory.voice([makeNote("C", 5)])])]),
        factory.part("Cello", "Vc.", [factory.measure([factory.voice([makeNote("C", 3)])])]),
      ],
      100
    );
    const lily = scoreToLily(score);
    const staffMatches = lily.match(/\\new Staff \{/g);
    expect(staffMatches).toHaveLength(2);
    expect(lily).toContain("c'4"); // C5
    expect(lily).toContain("c,4"); // C3
  });

  it("exports various durations", () => {
    const events: NoteEvent[] = [
      makeNote("C", 4, "whole"),
      makeNote("D", 4, "half"),
      makeNote("E", 4, "quarter"),
      makeNote("F", 4, "eighth"),
      makeNote("G", 4, "16th"),
      makeNote("A", 4, "32nd"),
    ];
    const lily = scoreToLily(makeScore(events));
    expect(lily).toContain("c1");
    expect(lily).toContain("d2");
    expect(lily).toContain("e4");
    expect(lily).toContain("f8");
    expect(lily).toContain("g16");
    expect(lily).toContain("a32");
  });

  it("exports accidentals correctly", () => {
    const events: NoteEvent[] = [
      makeNote("F", 4, "quarter", "sharp"),
      makeNote("B", 4, "quarter", "flat"),
      makeNote("C", 4, "quarter", "double-sharp"),
      makeNote("E", 4, "quarter", "double-flat"),
    ];
    const lily = scoreToLily(makeScore(events));
    expect(lily).toContain("fis4");
    expect(lily).toContain("bes4");
    expect(lily).toContain("cisis4");
    expect(lily).toContain("eeses4");
  });

  it("exports chords in LilyPond angle-bracket syntax", () => {
    const events: NoteEvent[] = [
      makeChord([
        { pitchClass: "C", octave: 4 },
        { pitchClass: "E", octave: 4 },
        { pitchClass: "G", octave: 4 },
        { pitchClass: "B", octave: 4, accidental: "flat" },
      ]),
    ];
    const lily = scoreToLily(makeScore(events));
    expect(lily).toContain("<c e g bes>4");
  });

  it("exports dotted notes", () => {
    const events: NoteEvent[] = [
      makeNote("C", 4, "quarter", "natural", 1),
      makeNote("D", 4, "half", "natural", 1),
    ];
    const lily = scoreToLily(makeScore(events));
    expect(lily).toContain("c4.");
    expect(lily).toContain("d2.");
  });

  it("exports multiple measures separated by bar lines", () => {
    const score = factory.score(
      "Test",
      "Composer",
      [
        factory.part("Piano", "Pno.", [
          factory.measure([factory.voice([makeNote("C", 4)])]),
          factory.measure([factory.voice([makeNote("D", 4)])]),
          factory.measure([factory.voice([makeNote("E", 4)])]),
        ]),
      ],
      120
    );
    const lily = scoreToLily(score);
    expect(lily).toContain("c4 | d4 | e4");
  });
});

// --- parseLilyToScore ---

describe("parseLilyToScore", () => {
  it("parses title and tempo", () => {
    const lily = `\\version "2.24.0"
\\header { title = "Test Song" }
\\tempo 4 = 140
\\new Staff { \\time 4/4
  c4 d4 e4 f4
}`;
    const score = parseLilyToScore(lily);
    expect(score.title).toBe("Test Song");
    expect(score.tempo).toBe(140);
  });

  it("parses notes with pitches", () => {
    const lily = '\\new Staff { c4 d4 e4 f4 }';
    const score = parseLilyToScore(lily);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(4);
    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("C");
      expect(events[0].head.pitch.octave).toBe(4);
    }
    if (events[3].kind === "note") {
      expect(events[3].head.pitch.pitchClass).toBe("F");
    }
  });

  it("parses octave marks", () => {
    const lily = "\\new Staff { c'4 c''4 c,4 c,,4 }";
    const score = parseLilyToScore(lily);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(4);
    if (events[0].kind === "note") expect(events[0].head.pitch.octave).toBe(5);
    if (events[1].kind === "note") expect(events[1].head.pitch.octave).toBe(6);
    if (events[2].kind === "note") expect(events[2].head.pitch.octave).toBe(3);
    if (events[3].kind === "note") expect(events[3].head.pitch.octave).toBe(2);
  });

  it("parses accidentals", () => {
    const lily = "\\new Staff { fis4 bes4 cisis4 eeses4 }";
    const score = parseLilyToScore(lily);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(4);
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("F");
      expect(events[0].head.pitch.accidental).toBe("sharp");
    }
    if (events[1].kind === "note") {
      expect(events[1].head.pitch.pitchClass).toBe("B");
      expect(events[1].head.pitch.accidental).toBe("flat");
    }
    if (events[2].kind === "note") {
      expect(events[2].head.pitch.pitchClass).toBe("C");
      expect(events[2].head.pitch.accidental).toBe("double-sharp");
    }
    if (events[3].kind === "note") {
      expect(events[3].head.pitch.pitchClass).toBe("E");
      expect(events[3].head.pitch.accidental).toBe("double-flat");
    }
  });

  it("parses durations", () => {
    const lily = "\\new Staff { c1 d2 e4 f8 g16 a32 }";
    const score = parseLilyToScore(lily);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(6);
    expect(events[0].duration.type).toBe("whole");
    expect(events[1].duration.type).toBe("half");
    expect(events[2].duration.type).toBe("quarter");
    expect(events[3].duration.type).toBe("eighth");
    expect(events[4].duration.type).toBe("16th");
    expect(events[5].duration.type).toBe("32nd");
  });

  it("parses dotted notes", () => {
    const lily = "\\new Staff { c4. d2. }";
    const score = parseLilyToScore(lily);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].duration.type).toBe("quarter");
    expect(events[0].duration.dots).toBe(1);
    expect(events[1].duration.type).toBe("half");
    expect(events[1].duration.dots).toBe(1);
  });

  it("parses rests", () => {
    const lily = "\\new Staff { c4 r4 e4 r4 }";
    const score = parseLilyToScore(lily);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(4);
    expect(events[1].kind).toBe("rest");
    expect(events[1].duration.type).toBe("quarter");
    expect(events[3].kind).toBe("rest");
  });

  it("parses chords", () => {
    const lily = "\\new Staff { <c e g>4 <d fis a>2 }";
    const score = parseLilyToScore(lily);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("chord");
    if (events[0].kind === "chord") {
      expect(events[0].heads).toHaveLength(3);
      expect(events[0].heads[0].pitch.pitchClass).toBe("C");
      expect(events[0].heads[1].pitch.pitchClass).toBe("E");
      expect(events[0].heads[2].pitch.pitchClass).toBe("G");
      expect(events[0].duration.type).toBe("quarter");
    }
    if (events[1].kind === "chord") {
      expect(events[1].heads[1].pitch.accidental).toBe("sharp");
      expect(events[1].duration.type).toBe("half");
    }
  });

  it("parses multiple measures", () => {
    const lily = "\\new Staff { c4 d4 e4 f4 | g4 a4 b4 c'4 }";
    const score = parseLilyToScore(lily);
    expect(score.parts[0].measures).toHaveLength(2);
    expect(score.parts[0].measures[0].voices[0].events).toHaveLength(4);
    expect(score.parts[0].measures[1].voices[0].events).toHaveLength(4);
  });

  it("parses multiple staves as multiple parts", () => {
    const lily = `\\version "2.24.0"
\\new Staff { c'4 d'4 }
\\new Staff { c,4 d,4 }`;
    const score = parseLilyToScore(lily);
    expect(score.parts).toHaveLength(2);
    const p1 = score.parts[0].measures[0].voices[0].events;
    const p2 = score.parts[1].measures[0].voices[0].events;
    if (p1[0].kind === "note") expect(p1[0].head.pitch.octave).toBe(5);
    if (p2[0].kind === "note") expect(p2[0].head.pitch.octave).toBe(3);
  });

  it("parses time signature", () => {
    const lily = "\\new Staff { \\time 3/4 c4 d4 e4 }";
    const score = parseLilyToScore(lily);
    const ts = score.parts[0].measures[0].timeSignature;
    expect(ts.numerator).toBe(3);
    expect(ts.denominator).toBe(4);
  });

  it("handles bare LilyPond without \\new Staff", () => {
    const lily = 'c4 d4 e4 f4';
    const score = parseLilyToScore(lily);
    const events = score.parts[0].measures[0].voices[0].events;
    expect(events).toHaveLength(4);
    expect(events[0].kind).toBe("note");
  });

  it("handles empty input gracefully", () => {
    const score = parseLilyToScore("");
    expect(score.parts.length).toBeGreaterThanOrEqual(1);
    expect(score.parts[0].measures.length).toBeGreaterThanOrEqual(1);
  });
});

// --- LilyPond round-trip ---

describe("round-trip: score -> LilyPond -> parse", () => {
  it("preserves note pitches through round-trip", () => {
    const original = makeScore([
      makeNote("C", 4),
      makeNote("E", 5),
      makeNote("G", 3),
      makeRest("quarter"),
    ]);
    const lily = scoreToLily(original);
    const parsed = parseLilyToScore(lily);
    const events = parsed.parts[0].measures[0].voices[0].events;

    expect(events).toHaveLength(4);
    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("C");
      expect(events[0].head.pitch.octave).toBe(4);
    }
    if (events[1].kind === "note") {
      expect(events[1].head.pitch.pitchClass).toBe("E");
      expect(events[1].head.pitch.octave).toBe(5);
    }
    if (events[2].kind === "note") {
      expect(events[2].head.pitch.pitchClass).toBe("G");
      expect(events[2].head.pitch.octave).toBe(3);
    }
    expect(events[3].kind).toBe("rest");
  });

  it("preserves accidentals through round-trip", () => {
    const original = makeScore([
      makeNote("F", 4, "quarter", "sharp"),
      makeNote("B", 4, "quarter", "flat"),
      makeNote("C", 4, "quarter", "double-sharp"),
      makeNote("E", 4, "quarter", "double-flat"),
    ]);
    const lily = scoreToLily(original);
    const parsed = parseLilyToScore(lily);
    const events = parsed.parts[0].measures[0].voices[0].events;

    if (events[0].kind === "note") expect(events[0].head.pitch.accidental).toBe("sharp");
    if (events[1].kind === "note") expect(events[1].head.pitch.accidental).toBe("flat");
    if (events[2].kind === "note") expect(events[2].head.pitch.accidental).toBe("double-sharp");
    if (events[3].kind === "note") expect(events[3].head.pitch.accidental).toBe("double-flat");
  });

  it("preserves durations through round-trip", () => {
    const original = makeScore([
      makeNote("C", 4, "whole"),
      makeNote("D", 4, "half"),
      makeNote("E", 4, "eighth"),
      makeNote("F", 4, "16th"),
    ]);
    const lily = scoreToLily(original);
    const parsed = parseLilyToScore(lily);
    const events = parsed.parts[0].measures[0].voices[0].events;

    expect(events[0].duration.type).toBe("whole");
    expect(events[1].duration.type).toBe("half");
    expect(events[2].duration.type).toBe("eighth");
    expect(events[3].duration.type).toBe("16th");
  });

  it("preserves chords through round-trip", () => {
    const original = makeScore([
      makeChord([
        { pitchClass: "C", octave: 4 },
        { pitchClass: "E", octave: 4 },
        { pitchClass: "G", octave: 4 },
      ]),
    ]);
    const lily = scoreToLily(original);
    const parsed = parseLilyToScore(lily);
    const events = parsed.parts[0].measures[0].voices[0].events;

    expect(events[0].kind).toBe("chord");
    if (events[0].kind === "chord") {
      expect(events[0].heads).toHaveLength(3);
      expect(events[0].heads[0].pitch.pitchClass).toBe("C");
      expect(events[0].heads[1].pitch.pitchClass).toBe("E");
      expect(events[0].heads[2].pitch.pitchClass).toBe("G");
    }
  });

  it("preserves title and tempo through round-trip", () => {
    const original = makeScore([makeNote("C", 4)], "My Song", 160);
    const lily = scoreToLily(original);
    const parsed = parseLilyToScore(lily);
    expect(parsed.title).toBe("My Song");
    expect(parsed.tempo).toBe(160);
  });
});
