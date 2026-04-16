import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { serializeToJson, deserializeFromJson, scoreToAIJson } from "../json";
import type { Note, Chord, GraceNote } from "../../model/note";

describe("serialization: muted flag", () => {
  it("round-trips muted note", () => {
    const n = factory.note("C", 4, factory.dur("quarter"));
    (n as any).muted = true;
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([n])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0] as Note;
    expect(evt.muted).toBe(true);
  });

  it("round-trips muted chord", () => {
    const ch = factory.chord([factory.noteHead("C", 4)], factory.dur("quarter"));
    (ch as any).muted = true;
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([ch])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0] as Chord;
    expect(evt.muted).toBe(true);
  });

  it("round-trips muted grace note", () => {
    const g = factory.graceNote("C", 4);
    (g as any).muted = true;
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([g])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0] as GraceNote;
    expect(evt.muted).toBe(true);
  });

  it("omits muted when false/undefined", () => {
    const n = factory.note("C", 4, factory.dur("quarter"));
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([n])])]),
    ]);

    const json = serializeToJson(score);
    expect(json).not.toContain('"muted"');
  });
});

describe("serialization: tuplet ratio", () => {
  it("round-trips tuplet on a note", () => {
    const n = factory.note("C", 4, factory.dur("quarter"));
    (n as any).tuplet = { actual: 3, normal: 2 };
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([n])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0];
    expect(evt.tuplet).toEqual({ actual: 3, normal: 2 });
  });

  it("round-trips tuplet on a rest", () => {
    const r = factory.rest(factory.dur("eighth"));
    (r as any).tuplet = { actual: 3, normal: 2 };
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([r])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0];
    expect(evt.tuplet).toEqual({ actual: 3, normal: 2 });
  });

  it("round-trips tuplet on a slash", () => {
    const sl = factory.slash(factory.dur("quarter"));
    (sl as any).tuplet = { actual: 5, normal: 4 };
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([sl])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0];
    expect(evt.tuplet).toEqual({ actual: 5, normal: 4 });
  });
});

describe("serialization: hairpin annotation", () => {
  it("round-trips crescendo hairpin", () => {
    const n1 = factory.note("C", 4, factory.dur("quarter"));
    const n2 = factory.note("D", 4, factory.dur("quarter"));
    const m = factory.measure([factory.voice([n1, n2])], {
      annotations: [
        { kind: "hairpin", type: "crescendo", startEventId: n1.id, endEventId: n2.id },
      ],
    });
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    const restored = deserializeFromJson(serializeToJson(score));
    const hairpins = restored.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "hairpin",
    );
    expect(hairpins).toHaveLength(1);
    if (hairpins[0].kind === "hairpin") {
      expect(hairpins[0].type).toBe("crescendo");
    }
  });

  it("round-trips diminuendo hairpin", () => {
    const n1 = factory.note("C", 4, factory.dur("quarter"));
    const n2 = factory.note("D", 4, factory.dur("quarter"));
    const m = factory.measure([factory.voice([n1, n2])], {
      annotations: [
        { kind: "hairpin", type: "diminuendo", startEventId: n1.id, endEventId: n2.id },
      ],
    });
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    const restored = deserializeFromJson(serializeToJson(score));
    const hairpins = restored.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "hairpin",
    );
    expect(hairpins).toHaveLength(1);
    if (hairpins[0].kind === "hairpin") {
      expect(hairpins[0].type).toBe("diminuendo");
    }
  });
});

describe("serialization: slash events", () => {
  it("round-trips slash notes", () => {
    const sl = factory.slash(factory.dur("quarter"));
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([sl])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0];
    expect(evt.kind).toBe("slash");
    expect(evt.duration.type).toBe("quarter");
  });
});

describe("serialization: articulations", () => {
  it("round-trips simple articulations", () => {
    const n = factory.note("C", 4, factory.dur("quarter"));
    (n as any).articulations = [{ kind: "staccato" }, { kind: "accent" }];
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([n])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0] as Note;
    expect(evt.articulations).toHaveLength(2);
    expect(evt.articulations![0].kind).toBe("staccato");
    expect(evt.articulations![1].kind).toBe("accent");
  });

  it("round-trips bend articulation with semitones", () => {
    const n = factory.note("C", 4, factory.dur("quarter"));
    (n as any).articulations = [{ kind: "bend", semitones: 2 }];
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([n])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0] as Note;
    expect(evt.articulations).toHaveLength(1);
    expect(evt.articulations![0].kind).toBe("bend");
    if (evt.articulations![0].kind === "bend") {
      expect(evt.articulations![0].semitones).toBe(2);
    }
  });
});

describe("serialization: stylesheet", () => {
  it("round-trips score with stylesheet", () => {
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([])])]),
    ]);
    score.stylesheet = { staffSize: 12, fontFamily: "sans-serif" };

    const restored = deserializeFromJson(serializeToJson(score));
    expect(restored.stylesheet).toBeDefined();
    expect(restored.stylesheet!.staffSize).toBe(12);
    expect(restored.stylesheet!.fontFamily).toBe("sans-serif");
  });

  it("omits stylesheet when empty or absent", () => {
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([])])]),
    ]);

    const json = serializeToJson(score);
    expect(json).not.toContain("stylesheet");
  });
});

describe("serialization: measure break", () => {
  it("round-trips system break", () => {
    const m = factory.measure([factory.voice([])]);
    m.break = "system";
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    const restored = deserializeFromJson(serializeToJson(score));
    expect(restored.parts[0].measures[0].break).toBe("system");
  });

  it("round-trips page break", () => {
    const m = factory.measure([factory.voice([])]);
    m.break = "page";
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    const restored = deserializeFromJson(serializeToJson(score));
    expect(restored.parts[0].measures[0].break).toBe("page");
  });

  it("omits break when not set", () => {
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([])])]),
    ]);

    const json = serializeToJson(score);
    expect(json).not.toContain('"break"');
  });
});

describe("serialization: renderStaff (cross-staff)", () => {
  it("round-trips renderStaff on note", () => {
    const n = factory.note("C", 4, factory.dur("quarter"));
    (n as any).renderStaff = 1;
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([n])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0] as Note;
    expect(evt.renderStaff).toBe(1);
  });

  it("round-trips renderStaff on grace note", () => {
    const g = factory.graceNote("C", 4);
    (g as any).renderStaff = 1;
    const score = factory.score("Test", "", [
      factory.part("P", "P", [factory.measure([factory.voice([g])])]),
    ]);

    const restored = deserializeFromJson(serializeToJson(score));
    const evt = restored.parts[0].measures[0].voices[0].events[0] as GraceNote;
    expect(evt.renderStaff).toBe(1);
  });
});

describe("serialization: voice staff property", () => {
  it("round-trips voice staff assignment", () => {
    const m = factory.measure([factory.voice([]), factory.voice([])]);
    m.voices[1].staff = 1;
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    const restored = deserializeFromJson(serializeToJson(score));
    expect(restored.parts[0].measures[0].voices[1].staff).toBe(1);
  });

  it("omits staff when 0 or undefined", () => {
    const m = factory.measure([factory.voice([])]);
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    const json = serializeToJson(score);
    expect(json).not.toContain('"staff"');
  });
});

describe("serialization: part tuning and capo", () => {
  it("round-trips tuning", () => {
    const p = factory.part("Guitar", "Gtr.", [factory.measure([factory.voice([])])]);
    p.tuning = { name: "Drop D", strings: [38, 45, 50, 55, 59, 64] };
    const score = factory.score("Test", "", [p]);

    const restored = deserializeFromJson(serializeToJson(score));
    expect(restored.parts[0].tuning).toEqual({ name: "Drop D", strings: [38, 45, 50, 55, 59, 64] });
  });

  it("round-trips capo", () => {
    const p = factory.part("Guitar", "Gtr.", [factory.measure([factory.voice([])])]);
    p.capo = 3;
    const score = factory.score("Test", "", [p]);

    const restored = deserializeFromJson(serializeToJson(score));
    expect(restored.parts[0].capo).toBe(3);
  });
});

describe("serialization: tempo mark with swing", () => {
  it("round-trips tempo mark with swing settings", () => {
    const m = factory.measure([factory.voice([])], {
      annotations: [
        {
          kind: "tempo-mark",
          bpm: 120,
          beatUnit: "quarter",
          text: "Allegro",
          swing: { style: "swing", ratio: 2, subdivision: "eighth" },
        },
      ],
    });
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    const restored = deserializeFromJson(serializeToJson(score));
    const tempos = restored.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "tempo-mark",
    );
    expect(tempos).toHaveLength(1);
    if (tempos[0].kind === "tempo-mark") {
      expect(tempos[0].bpm).toBe(120);
      expect(tempos[0].text).toBe("Allegro");
      expect(tempos[0].swing).toBeDefined();
      expect(tempos[0].swing!.style).toBe("swing");
      expect(tempos[0].swing!.ratio).toBe(2);
    }
  });
});

describe("scoreToAIJson", () => {
  it("filters out empty measures", () => {
    const score = factory.score("Test", "", [
      factory.part("P", "P", [
        factory.measure([factory.voice([factory.note("C", 4, factory.dur("quarter"))])]),
        factory.measure([factory.voice([])]),
        factory.measure([factory.voice([])]),
      ]),
    ]);

    const aiJson = scoreToAIJson(score) as any;
    expect(aiJson.parts[0].totalMeasures).toBe(3);
    // Only the non-empty measure should be included
    expect(aiJson.parts[0].measures).toHaveLength(1);
  });

  it("includes at least one measure even if all empty", () => {
    const score = factory.score("Test", "", [
      factory.part("P", "P", [
        factory.measure([factory.voice([])]),
        factory.measure([factory.voice([])]),
      ]),
    ]);

    const aiJson = scoreToAIJson(score) as any;
    expect(aiJson.parts[0].measures.length).toBeGreaterThanOrEqual(1);
  });

  it("includes title, composer, and tempo", () => {
    const score = factory.score("My Song", "Bach", [
      factory.part("P", "P", [factory.measure([factory.voice([])])]),
    ], 140);

    const aiJson = scoreToAIJson(score) as any;
    expect(aiJson.title).toBe("My Song");
    expect(aiJson.composer).toBe("Bach");
    expect(aiJson.tempo).toBe(140);
  });
});
