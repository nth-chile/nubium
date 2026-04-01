import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { SetChordSymbol } from "../SetChordSymbol";
import { SetLyric } from "../SetLyric";
import { SetRehearsalMark } from "../SetRehearsalMark";
import { SetTempo } from "../SetTempo";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(overrides?: {
  measures?: ReturnType<typeof factory.measure>[];
  cursor?: Partial<ReturnType<typeof defaultInputState>["cursor"]>;
}): EditorSnapshot {
  const measures = overrides?.measures ?? [
    factory.measure([
      factory.voice([
        factory.note("C", 4, factory.dur("quarter")),
        factory.note("D", 4, factory.dur("quarter")),
      ]),
    ]),
    factory.measure([factory.voice([])]),
  ];
  const input = defaultInputState();
  if (overrides?.cursor) {
    Object.assign(input.cursor, overrides.cursor);
  }
  return {
    score: factory.score("Test", "", [factory.part("P", "P", measures)]),
    inputState: input,
  };
}

describe("SetChordSymbol", () => {
  it("adds a chord symbol to a measure", () => {
    const snap = makeSnapshot();
    const noteId = snap.score.parts[0].measures[0].voices[0].events[0].id;
    const cmd = new SetChordSymbol("Cmaj7", 0, noteId);
    const result = cmd.execute(snap);

    const annotations = result.score.parts[0].measures[0].annotations;
    expect(annotations).toHaveLength(1);
    expect(annotations[0].kind).toBe("chord-symbol");
    if (annotations[0].kind === "chord-symbol") {
      expect(annotations[0].text).toBe("Cmaj7");
      expect(annotations[0].beatOffset).toBe(0);
      expect(annotations[0].noteEventId).toBe(noteId);
    }
  });

  it("replaces an existing chord at the same beat offset", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    const m = factory.measure(
      [factory.voice([note])],
      { annotations: [{ kind: "chord-symbol", text: "Dm7", beatOffset: 0, noteEventId: note.id }] }
    );
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });

    const cmd = new SetChordSymbol("G7", 0, note.id);
    const result = cmd.execute(snap);

    const chords = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "chord-symbol"
    );
    expect(chords).toHaveLength(1);
    if (chords[0].kind === "chord-symbol") {
      expect(chords[0].text).toBe("G7");
    }
  });

  it("removes chord when text is empty", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    const m = factory.measure(
      [factory.voice([note])],
      { annotations: [{ kind: "chord-symbol", text: "Am", beatOffset: 0, noteEventId: note.id }] }
    );
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });

    const cmd = new SetChordSymbol("", 0, note.id);
    const result = cmd.execute(snap);

    const chords = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "chord-symbol"
    );
    expect(chords).toHaveLength(0);
  });

  it("allows multiple chords at different beat offsets", () => {
    const snap = makeSnapshot();
    const events = snap.score.parts[0].measures[0].voices[0].events;

    const r1 = new SetChordSymbol("C", 0, events[0].id).execute(snap);
    const r2 = new SetChordSymbol("G", 480, events[1].id).execute(r1);

    const chords = r2.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "chord-symbol"
    );
    expect(chords).toHaveLength(2);
  });
});

describe("SetLyric", () => {
  it("adds a lyric to a note event", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const cmd = new SetLyric("Hel", "begin");
    const result = cmd.execute(snap);

    const lyrics = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "lyric"
    );
    expect(lyrics).toHaveLength(1);
    if (lyrics[0].kind === "lyric") {
      expect(lyrics[0].text).toBe("Hel");
      expect(lyrics[0].syllableType).toBe("begin");
    }
  });

  it("advances cursor to next event after setting lyric", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const cmd = new SetLyric("Hello");
    const result = cmd.execute(snap);

    expect(result.inputState.cursor.eventIndex).toBe(1);
  });

  it("advances to next measure when at last event", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 1 } });
    const cmd = new SetLyric("World");
    const result = cmd.execute(snap);

    expect(result.inputState.cursor.measureIndex).toBe(1);
    expect(result.inputState.cursor.eventIndex).toBe(0);
  });

  it("removes lyric when text is empty", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const r1 = new SetLyric("Hello").execute(snap);
    // Now remove it — cursor advanced, so set it back
    const r2 = { ...r1, inputState: { ...r1.inputState, cursor: { ...r1.inputState.cursor, eventIndex: 0 } } };
    const result = new SetLyric("").execute(r2);

    const lyrics = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "lyric"
    );
    expect(lyrics).toHaveLength(0);
  });

  it("defaults to verse 1 and single syllable type", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const cmd = new SetLyric("Word");
    const result = cmd.execute(snap);

    const lyric = result.score.parts[0].measures[0].annotations.find(
      (a) => a.kind === "lyric"
    );
    expect(lyric).toBeDefined();
    if (lyric?.kind === "lyric") {
      expect(lyric.verseNumber).toBe(1);
      expect(lyric.syllableType).toBe("single");
    }
  });

  it("supports multiple verses on the same note", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    // Add verse 1
    const r1 = new SetLyric("Hello", "single", 1).execute(snap);
    // Reset cursor for verse 2
    const r2 = { ...r1, inputState: { ...r1.inputState, cursor: { ...r1.inputState.cursor, eventIndex: 0 } } };
    const result = new SetLyric("Goodbye", "single", 2).execute(r2);

    const lyrics = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "lyric"
    );
    expect(lyrics).toHaveLength(2);
    const v1 = lyrics.find((a) => a.kind === "lyric" && a.verseNumber === 1);
    const v2 = lyrics.find((a) => a.kind === "lyric" && a.verseNumber === 2);
    expect(v1?.kind === "lyric" && v1.text).toBe("Hello");
    expect(v2?.kind === "lyric" && v2.text).toBe("Goodbye");
  });

  it("replaces only the matching verse when updating", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const r1 = new SetLyric("One", "single", 1).execute(snap);
    const r2 = { ...r1, inputState: { ...r1.inputState, cursor: { ...r1.inputState.cursor, eventIndex: 0 } } };
    const r3 = new SetLyric("Two", "single", 2).execute(r2);
    // Now update verse 1 only
    const r4 = { ...r3, inputState: { ...r3.inputState, cursor: { ...r3.inputState.cursor, eventIndex: 0 } } };
    const result = new SetLyric("Updated", "single", 1).execute(r4);

    const lyrics = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "lyric"
    );
    expect(lyrics).toHaveLength(2);
    const v1 = lyrics.find((a) => a.kind === "lyric" && a.verseNumber === 1);
    const v2 = lyrics.find((a) => a.kind === "lyric" && a.verseNumber === 2);
    expect(v1?.kind === "lyric" && v1.text).toBe("Updated");
    expect(v2?.kind === "lyric" && v2.text).toBe("Two");
  });

  it("removes only the matching verse when text is empty", () => {
    const snap = makeSnapshot({ cursor: { eventIndex: 0 } });
    const r1 = new SetLyric("One", "single", 1).execute(snap);
    const r2 = { ...r1, inputState: { ...r1.inputState, cursor: { ...r1.inputState.cursor, eventIndex: 0 } } };
    const r3 = new SetLyric("Two", "single", 2).execute(r2);
    // Remove verse 1
    const r4 = { ...r3, inputState: { ...r3.inputState, cursor: { ...r3.inputState.cursor, eventIndex: 0 } } };
    const result = new SetLyric("", "single", 1).execute(r4);

    const lyrics = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "lyric"
    );
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0].kind === "lyric" && lyrics[0].verseNumber).toBe(2);
    expect(lyrics[0].kind === "lyric" && lyrics[0].text).toBe("Two");
  });
});

describe("SetRehearsalMark", () => {
  it("adds a rehearsal mark to the current measure", () => {
    const snap = makeSnapshot();
    const cmd = new SetRehearsalMark("A");
    const result = cmd.execute(snap);

    const marks = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "rehearsal-mark"
    );
    expect(marks).toHaveLength(1);
    if (marks[0].kind === "rehearsal-mark") {
      expect(marks[0].text).toBe("A");
    }
  });

  it("replaces an existing rehearsal mark", () => {
    const m = factory.measure(
      [factory.voice([])],
      { annotations: [{ kind: "rehearsal-mark", text: "A" }] }
    );
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });

    const cmd = new SetRehearsalMark("B");
    const result = cmd.execute(snap);

    const marks = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "rehearsal-mark"
    );
    expect(marks).toHaveLength(1);
    if (marks[0].kind === "rehearsal-mark") {
      expect(marks[0].text).toBe("B");
    }
  });

  it("removes rehearsal mark when text is empty", () => {
    const m = factory.measure(
      [factory.voice([])],
      { annotations: [{ kind: "rehearsal-mark", text: "A" }] }
    );
    const snap = makeSnapshot({ measures: [m, factory.measure([factory.voice([])])] });

    const cmd = new SetRehearsalMark("");
    const result = cmd.execute(snap);

    const marks = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "rehearsal-mark"
    );
    expect(marks).toHaveLength(0);
  });
});

describe("SetTempo", () => {
  it("adds a tempo mark to the current measure", () => {
    const snap = makeSnapshot();
    const cmd = new SetTempo(120);
    const result = cmd.execute(snap);

    const tempos = result.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "tempo-mark"
    );
    expect(tempos).toHaveLength(1);
    if (tempos[0].kind === "tempo-mark") {
      expect(tempos[0].bpm).toBe(120);
      expect(tempos[0].beatUnit).toBe("quarter");
    }
  });

  it("replaces an existing tempo mark", () => {
    const snap = makeSnapshot();
    const r1 = new SetTempo(120).execute(snap);
    const r2 = new SetTempo(140, "half", "Allegro").execute(r1);

    const tempos = r2.score.parts[0].measures[0].annotations.filter(
      (a) => a.kind === "tempo-mark"
    );
    expect(tempos).toHaveLength(1);
    if (tempos[0].kind === "tempo-mark") {
      expect(tempos[0].bpm).toBe(140);
      expect(tempos[0].beatUnit).toBe("half");
      expect(tempos[0].text).toBe("Allegro");
    }
  });

  it("defaults beat unit to quarter", () => {
    const snap = makeSnapshot();
    const cmd = new SetTempo(100);
    const result = cmd.execute(snap);

    const tempo = result.score.parts[0].measures[0].annotations.find(
      (a) => a.kind === "tempo-mark"
    );
    if (tempo?.kind === "tempo-mark") {
      expect(tempo.beatUnit).toBe("quarter");
    }
  });
});
