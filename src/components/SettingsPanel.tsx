import { useState, useEffect } from "react";
import { getSettings, updateSettings, subscribeSettings, type AppSettings } from "../settings";
import type { ClefType } from "../model";

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  useEffect(() => {
    const unsub = subscribeSettings((s) => setSettings({ ...s }));
    return unsub;
  }, []);

  if (!visible) return null;

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSettings({ [key]: value });
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Settings</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            X
          </button>
        </div>

        <div style={styles.body}>
          {/* General */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>General</h3>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Default Tempo</span>
              <input
                type="number"
                min={20}
                max={300}
                value={settings.defaultTempo}
                onChange={(e) => update("defaultTempo", parseInt(e.target.value) || 120)}
                style={styles.input}
              />
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Time Signature</span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={settings.defaultTimeSignature.numerator}
                  onChange={(e) =>
                    update("defaultTimeSignature", {
                      ...settings.defaultTimeSignature,
                      numerator: parseInt(e.target.value) || 4,
                    })
                  }
                  style={{ ...styles.input, width: 50 }}
                />
                <span>/</span>
                <select
                  value={settings.defaultTimeSignature.denominator}
                  onChange={(e) =>
                    update("defaultTimeSignature", {
                      ...settings.defaultTimeSignature,
                      denominator: parseInt(e.target.value),
                    })
                  }
                  style={styles.select}
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                </select>
              </div>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Default Clef</span>
              <select
                value={settings.defaultClef}
                onChange={(e) => update("defaultClef", e.target.value as ClefType)}
                style={styles.select}
              >
                <option value="treble">Treble</option>
                <option value="bass">Bass</option>
                <option value="alto">Alto</option>
                <option value="tenor">Tenor</option>
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Auto Beam</span>
              <input
                type="checkbox"
                checked={settings.autoBeam}
                onChange={(e) => update("autoBeam", e.target.checked)}
              />
            </label>
          </div>

          {/* Playback */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Playback</h3>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Playback Enabled</span>
              <input
                type="checkbox"
                checked={settings.playbackEnabled}
                onChange={(e) => update("playbackEnabled", e.target.checked)}
              />
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Metronome Enabled</span>
              <input
                type="checkbox"
                checked={settings.metronomeEnabled}
                onChange={(e) => update("metronomeEnabled", e.target.checked)}
              />
            </label>
          </div>

          {/* AI */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>AI</h3>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>AI Provider</span>
              <select
                value={settings.aiProvider}
                onChange={(e) => update("aiProvider", e.target.value as "anthropic" | "openai")}
                style={styles.select}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
          </div>

          {/* Appearance */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Appearance</h3>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Theme</span>
              <select
                value={settings.theme}
                onChange={(e) => update("theme", e.target.value as "light" | "dark")}
                style={styles.select}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Keyboard Layout</span>
              <select
                value={settings.keyboardLayout}
                onChange={(e) =>
                  update("keyboardLayout", e.target.value as "standard" | "custom")
                }
                style={styles.select}
              >
                <option value="standard">Standard</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  panel: {
    background: "#fff",
    borderRadius: 8,
    width: 480,
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: "#1e293b",
  },
  closeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    color: "#64748b",
    padding: "4px 8px",
  },
  body: {
    padding: "16px 20px",
    overflowY: "auto" as const,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#475569",
    margin: "0 0 12px 0",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  field: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
  },
  fieldLabel: {
    fontSize: 14,
    color: "#334155",
  },
  input: {
    padding: "4px 8px",
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    fontSize: 14,
    width: 80,
  },
  select: {
    padding: "4px 8px",
    border: "1px solid #e2e8f0",
    borderRadius: 4,
    fontSize: 14,
  },
};
