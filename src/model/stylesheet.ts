export interface Stylesheet {
  staffSize: number;        // pixels per staff space (default 8)
  spacingFactor: number;    // multiplier for proportional spacing (default 1.0)
  chordSymbolSize: number;  // font size for chord symbols (default 14)
  lyricSize: number;        // font size for lyrics (default 14)
  measureMinWidth: number;  // minimum measure width (default 150)
  measureMaxWidth: number;  // maximum measure width (default 400)
  systemMarginLeft: number; // left margin (default 20)
  systemMarginRight: number; // right margin (default 20)
  staffSpacing: number;     // vertical space between staves (default 80)
  fontFamily: string;       // default font (default "serif")
}

export function defaultStylesheet(): Stylesheet {
  return {
    staffSize: 8,
    spacingFactor: 1.0,
    chordSymbolSize: 14,
    lyricSize: 16,
    measureMinWidth: 150,
    measureMaxWidth: 700,
    systemMarginLeft: 20,
    systemMarginRight: 20,
    staffSpacing: 80,
    fontFamily: "serif",
  };
}

export function resolveStylesheet(partial?: Partial<Stylesheet>): Stylesheet {
  return { ...defaultStylesheet(), ...partial };
}
