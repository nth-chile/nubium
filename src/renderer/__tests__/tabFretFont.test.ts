import { describe, it, expect } from "vitest";
import { TabNote } from "vexflow";
import "../TabRenderer";

describe("TabNote fret font size", () => {
  // VexFlow's default TabNote.text size is 9pt — we bump to 11pt for readability.
  const EXPECTED_SIZE = "11pt";

  it("renders fret numbers at the bumped size", () => {
    const el = TabNote.tabToElement("5");
    expect(el.fontInfo?.size).toBe(EXPECTED_SIZE);
  });

  it("renders 'X' (dead note) at the bumped size", () => {
    const el = TabNote.tabToElement("X");
    expect(el.fontInfo?.size).toBe(EXPECTED_SIZE);
  });

  it("renders multi-digit frets at the bumped size", () => {
    const el = TabNote.tabToElement("12");
    expect(el.fontInfo?.size).toBe(EXPECTED_SIZE);
  });
});
