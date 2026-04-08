import { useState, useEffect, type ReactNode } from "react";
import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import type { Score } from "../../model";

// --- SVG Icons (14x14, stroke-based) ---

const S = 14; // icon size
const sw = "1.8"; // stroke width

const Icon = ({ children }: { children: ReactNode }) => (
  <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const icons: Record<string, ReactNode> = {
  // Articulations
  staccato: <Icon><circle cx="7" cy="9" r="1.5" fill="currentColor" stroke="none"/></Icon>,
  accent: <Icon><path d="M3 10 L7 4 L11 10"/></Icon>,
  tenuto: <Icon><line x1="3" y1="8" x2="11" y2="8"/></Icon>,
  marcato: <Icon><path d="M4 10 L7 3 L10 10"/><line x1="4" y1="12" x2="10" y2="12"/></Icon>,
  fermata: <Icon><path d="M2 11 Q7 1 12 11"/><circle cx="7" cy="9" r="1.2" fill="currentColor" stroke="none"/></Icon>,

  // Ornaments
  trill: <span className="text-[10px] font-bold italic">tr</span>,
  vibrato: <Icon><path d="M1 7 Q3.5 2 5 7 Q6.5 12 8 7 Q9.5 2 11 7 Q12 10 13 7"/></Icon>,
  mordent: <Icon><path d="M2 7 L5 4 L7 10 L9 4 L12 7"/></Icon>,
  turn: <Icon><path d="M2 7 Q4 2 7 7 Q10 12 12 7"/></Icon>,

  // Bends
  bend: <Icon><path d="M4 12 L4 5 Q4 2 7 2 L10 2" fill="none"/><path d="M8 0 L10 2 L8 4" fill="none"/></Icon>,
  "pre-bend": <Icon><path d="M4 12 L4 2" fill="none"/><path d="M2.5 4 L4 1.5 L5.5 4" fill="none"/><line x1="4" y1="2" x2="10" y2="2" strokeDasharray="1.5 1.5"/></Icon>,
  "bend-release": <Icon><path d="M3 12 L3 5 Q3 2 5.5 2 Q8 2 8 5 L8 12" fill="none"/><path d="M6.5 0 L8.5 2 L6.5 4" fill="none" strokeWidth="1.5"/></Icon>,

  // Slides
  "slide-up": <Icon><line x1="3" y1="11" x2="11" y2="3"/></Icon>,
  "slide-down": <Icon><line x1="3" y1="3" x2="11" y2="11"/></Icon>,
  "slide-in-below": <Icon><line x1="1" y1="12" x2="9" y2="5"/><circle cx="10" cy="4" r="1.5" fill="currentColor" stroke="none"/></Icon>,
  "slide-in-above": <Icon><line x1="1" y1="2" x2="9" y2="9"/><circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none"/></Icon>,
  "slide-out-above": <Icon><circle cx="4" cy="10" r="1.5" fill="currentColor" stroke="none"/><line x1="5" y1="9" x2="13" y2="2"/></Icon>,
  "slide-out-below": <Icon><circle cx="4" cy="4" r="1.5" fill="currentColor" stroke="none"/><line x1="5" y1="5" x2="13" y2="12"/></Icon>,

  // Legato
  "hammer-on": <Icon><path d="M2 9 Q7 2 12 9" fill="none"/><text x="7" y="8" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor" stroke="none">H</text></Icon>,
  "pull-off": <Icon><path d="M2 9 Q7 2 12 9" fill="none"/><text x="7" y="8" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor" stroke="none">P</text></Icon>,

  // String techniques
  "palm-mute": <span className="text-[9px] font-bold">PM</span>,
  "dead-note": <Icon><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></Icon>,
  "ghost-note": <Icon><path d="M4 2 Q1 7 4 12" fill="none"/><path d="M10 2 Q13 7 10 12" fill="none"/></Icon>,
  tapping: <Icon><text x="7" y="11" textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor" stroke="none">T</text></Icon>,
  "let-ring": <Icon><path d="M2 4 Q2 12 7 12 Q12 12 12 4" fill="none"/><circle cx="7" cy="5" r="1" fill="currentColor" stroke="none"/></Icon>,
  harmonic: <Icon><path d="M7 1 L12 7 L7 13 L2 7 Z" fill="none"/></Icon>,
  "tremolo-picking": <Icon><line x1="7" y1="1" x2="7" y2="13"/><line x1="4" y1="4" x2="10" y2="3"/><line x1="4" y1="7" x2="10" y2="6"/><line x1="4" y1="10" x2="10" y2="9"/></Icon>,

  // Bowing
  "down-bow": <Icon><path d="M3 3 L3 11 L11 11 L11 3" fill="none"/></Icon>,
  "up-bow": <Icon><path d="M4 11 L7 3 L10 11" fill="none"/></Icon>,

  // Picking
  "down-stroke": <Icon><line x1="7" y1="2" x2="7" y2="11"/><path d="M4 8 L7 12 L10 8" fill="none"/></Icon>,
  "up-stroke": <Icon><path d="M4 11 L7 3 L10 11" fill="none"/></Icon>,
  "fingerpick-p": <span className="text-[10px] font-bold">p</span>,
  "fingerpick-i": <span className="text-[10px] font-bold">i</span>,
  "fingerpick-m": <span className="text-[10px] font-bold">m</span>,
  "fingerpick-a": <span className="text-[10px] font-bold">a</span>,
};

// --- Technique definitions ---

interface TechButton {
  id: string; // matches articulation kind / icon key
  command: string;
  title: string;
}

interface TechGroup {
  name: string;
  instruments?: Set<string>;
  buttons: TechButton[];
}

const FRETTED = new Set(["guitar", "bass"]);
const BOWED = new Set(["violin", "viola", "cello"]);
const STRINGS = new Set(["guitar", "bass", "violin", "viola", "cello"]);

const GROUPS: TechGroup[] = [
  {
    name: "Articulations",
    buttons: [
      { id: "staccato", command: "notation.articulation-staccato", title: "Staccato" },
      { id: "accent", command: "notation.articulation-accent", title: "Accent" },
      { id: "tenuto", command: "notation.articulation-tenuto", title: "Tenuto" },
      { id: "marcato", command: "notation.articulation-marcato", title: "Marcato" },
      { id: "fermata", command: "notation.articulation-fermata", title: "Fermata" },
    ],
  },
  {
    name: "Ornaments",
    buttons: [
      { id: "trill", command: "notation.articulation-trill", title: "Trill" },
      { id: "vibrato", command: "notation.articulation-vibrato", title: "Vibrato (v)" },
      { id: "mordent", command: "notation.articulation-mordent", title: "Mordent" },
      { id: "turn", command: "notation.articulation-turn", title: "Turn" },
    ],
  },
  {
    name: "Bends",
    instruments: FRETTED,
    buttons: [
      { id: "bend", command: "notation.articulation-bend", title: "Bend (b)" },
      { id: "pre-bend", command: "notation.articulation-pre-bend", title: "Pre-bend" },
      { id: "bend-release", command: "notation.articulation-bend-release", title: "Bend & Release" },
    ],
  },
  {
    name: "Slides",
    instruments: STRINGS,
    buttons: [
      { id: "slide-up", command: "notation.articulation-slide-up", title: "Slide up (s)" },
      { id: "slide-down", command: "notation.articulation-slide-down", title: "Slide down" },
      { id: "slide-in-below", command: "notation.articulation-slide-in-below", title: "Slide in from below" },
      { id: "slide-in-above", command: "notation.articulation-slide-in-above", title: "Slide in from above" },
      { id: "slide-out-above", command: "notation.articulation-slide-out-above", title: "Slide out upward" },
      { id: "slide-out-below", command: "notation.articulation-slide-out-below", title: "Slide out downward" },
    ],
  },
  {
    name: "Legato",
    instruments: STRINGS,
    buttons: [
      { id: "hammer-on", command: "notation.articulation-hammer-on", title: "Hammer-on (h)" },
      { id: "pull-off", command: "notation.articulation-pull-off", title: "Pull-off (p)" },
    ],
  },
  {
    name: "Techniques",
    instruments: STRINGS,
    buttons: [
      { id: "palm-mute", command: "notation.articulation-palm-mute", title: "Palm mute (m)" },
      { id: "dead-note", command: "notation.articulation-dead-note", title: "Dead note (x)" },
      { id: "ghost-note", command: "notation.articulation-ghost-note", title: "Ghost note (o)" },
      { id: "tapping", command: "notation.articulation-tapping", title: "Tapping (t)" },
      { id: "let-ring", command: "notation.articulation-let-ring", title: "Let ring (l)" },
      { id: "harmonic", command: "notation.articulation-harmonic", title: "Harmonic" },
      { id: "tremolo-picking", command: "notation.articulation-tremolo-picking", title: "Tremolo picking" },
    ],
  },
  {
    name: "Bowing",
    instruments: BOWED,
    buttons: [
      { id: "down-bow", command: "notation.articulation-down-bow", title: "Down bow" },
      { id: "up-bow", command: "notation.articulation-up-bow", title: "Up bow" },
    ],
  },
  {
    name: "Picking",
    instruments: FRETTED,
    buttons: [
      { id: "down-stroke", command: "notation.articulation-down-stroke", title: "Down stroke" },
      { id: "up-stroke", command: "notation.articulation-up-stroke", title: "Up stroke" },
      { id: "fingerpick-p", command: "notation.articulation-fingerpick-p", title: "Thumb (p)" },
      { id: "fingerpick-i", command: "notation.articulation-fingerpick-i", title: "Index (i)" },
      { id: "fingerpick-m", command: "notation.articulation-fingerpick-m", title: "Middle (m)" },
      { id: "fingerpick-a", command: "notation.articulation-fingerpick-a", title: "Ring (a)" },
    ],
  },
];

// --- Group visibility (persisted to localStorage) ---

const STORAGE_KEY = "nubium-techniques-hidden";
let hiddenGroups = new Set<string>(
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
);
const visListeners = new Set<() => void>();

function toggleGroupVisibility(name: string) {
  if (hiddenGroups.has(name)) hiddenGroups.delete(name);
  else hiddenGroups.add(name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hiddenGroups]));
  visListeners.forEach((l) => l());
}

function useHiddenGroups(): Set<string> {
  const [, bump] = useState(0);
  useEffect(() => {
    const cb = () => bump((v) => v + 1);
    visListeners.add(cb);
    return () => { visListeners.delete(cb); };
  }, []);
  return hiddenGroups;
}

// --- Panel ---

function TechniquesPanel({ api }: { api: PluginAPI }) {
  const [score, setScore] = useState<Score>(api.getScore);
  const [partIndex, setPartIndex] = useState(() => api.getCursorPosition().partIndex);
  const hidden = useHiddenGroups();

  useEffect(() => {
    const onScore = (s: Score) => setScore(s);
    const onCursor = (c: { partIndex: number }) => setPartIndex(c.partIndex);
    api.on("scoreChanged", onScore);
    api.on("cursorChanged", onCursor);
    return () => {
      api.off("scoreChanged", onScore);
      api.off("cursorChanged", onCursor);
    };
  }, [api]);

  const instrumentId = score.parts[partIndex]?.instrumentId ?? "piano";

  const visibleGroups = GROUPS.filter(
    (g) => (!g.instruments || g.instruments.has(instrumentId)) && !hidden.has(g.name)
  );

  if (visibleGroups.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        All groups hidden. Use the panel menu to show groups.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {visibleGroups.map((group) => (
        <div key={group.name}>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {group.name}
          </div>
          <div className="flex flex-wrap gap-0.5">
            {group.buttons.map((btn) => (
              <button
                key={btn.command}
                onClick={() => api.executeCommand(btn.command)}
                title={btn.title}
                className="h-7 w-7 flex items-center justify-center rounded border border-input bg-background hover:bg-accent transition-colors"
              >
                {icons[btn.id] ?? <span className="text-[10px] font-bold">{btn.id}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

let sharedApi: PluginAPI | null = null;

function getMenuItems() {
  return GROUPS.map((g) => ({
    label: g.name,
    checked: !hiddenGroups.has(g.name),
    onClick: () => toggleGroupVisibility(g.name),
  }));
}

export const TechniquesPlugin: NubiumPlugin = {
  id: "nubium.techniques",
  name: "Techniques",
  version: "1.0.0",
  description: "Context-aware articulation and technique palette",

  activate(api: PluginAPI) {
    sharedApi = api;
    api.registerPanel("techniques.panel", {
      title: "Techniques",
      location: "sidebar-left",
      component: () => sharedApi ? <TechniquesPanel api={sharedApi} /> : null,
      defaultEnabled: true,
      menuItems: getMenuItems,
    });
  },

  deactivate() {
    sharedApi = null;
  },
};
