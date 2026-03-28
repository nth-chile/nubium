import { ScoreCanvas } from "./components/ScoreCanvas";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { TextInput } from "./components/TextInput";
import { SettingsPanel } from "./components/SettingsPanel";
import { PluginPanel } from "./components/PluginPanel";
import { CommandPalette } from "./components/CommandPalette";
import { PluginViewSwitcher } from "./components/PluginViewSwitcher";
import { PanelLayout } from "./components/PanelLayout";
import { useEditorStore } from "./state";
import { saveScore } from "./fileio/save";
import { loadScore } from "./fileio/load";
import { useEffect, useCallback, useState, useRef, useSyncExternalStore } from "react";
import {
  PluginManager,
  TransposePlugin,
  RetrogradePlugin,
  AugmentPlugin,
  ChordAnalysisPlugin,
  ViewsPlugin,
  MusicXMLPlugin,
  PlaybackPlugin,
  AIChatPlugin,
  PartManagerPlugin,
  ScoreEditorPlugin,
} from "./plugins";

export function App() {
  const score = useEditorStore((s) => s.score);
  const filePath = useEditorStore((s) => s.filePath);
  const setScore = useEditorStore((s) => s.setScore);
  const setFilePath = useEditorStore((s) => s.setFilePath);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [pluginsVisible, setPluginsVisible] = useState(false);

  // Plugin manager singleton
  const pluginManagerRef = useRef<PluginManager | null>(null);
  if (!pluginManagerRef.current) {
    pluginManagerRef.current = new PluginManager({
      getScore: () => useEditorStore.getState().score,
      applyScore: (newScore) => {
        useEditorStore.getState().setScore(newScore);
      },
      getCursor: () => useEditorStore.getState().inputState.cursor,
      getSelection: () => null, // Selection not yet implemented
      showNotification: (message, type) => {
        console.log(`[${type ?? "info"}] ${message}`);
      },
    });

    const pm = pluginManagerRef.current;

    // Register and activate built-in feature plugins (enabled by default)
    pm.registerAndActivate(ViewsPlugin, true);
    pm.registerAndActivate(PlaybackPlugin, true);
    pm.registerAndActivate(AIChatPlugin, true);
    pm.registerAndActivate(PartManagerPlugin, true);
    pm.registerAndActivate(MusicXMLPlugin, true);
    pm.registerAndActivate(ScoreEditorPlugin, true);

    // Register and activate built-in transform plugins (enabled by default)
    pm.registerAndActivate(TransposePlugin, true);
    pm.registerAndActivate(RetrogradePlugin, true);
    pm.registerAndActivate(AugmentPlugin, true);
    pm.registerAndActivate(ChordAnalysisPlugin, true);
  }

  const pm = pluginManagerRef.current;

  // Subscribe to plugin manager changes so we re-render when plugins are toggled
  const pluginVersion = useSyncExternalStore(
    (cb) => pm.subscribe(cb),
    () => {
      // Return a snapshot that changes when plugins change
      const plugins = pm.getPlugins();
      return plugins.map((p) => `${p.plugin.id}:${p.enabled}`).join(",");
    }
  );

  // Derive panels from plugin registry
  const toolbarPanels = pm.getPanels("toolbar");
  const leftPanels = pm.getPanels("sidebar-left");
  const rightPanels = pm.getPanels("sidebar-right");
  const views = pm.getViews();

  const handleSave = useCallback(async () => {
    try {
      // Save exports a .notation JSON file (the working copy)
      // Never overwrites the imported source file — always prompts for a new path
      const path = await saveScore(score);
      setFilePath(path);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [score, setFilePath]);

  const handleOpen = useCallback(async () => {
    try {
      const result = await loadScore();
      if (result) {
        // Store the original import path as metadata but don't overwrite source
        setScore(result.score, result.path);
        setFilePath(null); // working copy lives in localStorage, not the source file
      }
    } catch (err) {
      console.error("Load failed:", err);
    }
  }, [setScore, setFilePath]);

  // Ctrl+S / Ctrl+O
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        handleOpen();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleOpen]);

  // Suppress unused variable warning — pluginVersion is used to trigger re-renders
  void pluginVersion;

  return (
    <div style={styles.app}>
      <KeyboardShortcuts />
      <Toolbar
        onToggleSettings={() => setSettingsVisible((v) => !v)}
        onTogglePlugins={() => setPluginsVisible((v) => !v)}
        onOpen={handleOpen}
        onSave={handleSave}
      />

      {/* Plugin-registered toolbar panels (e.g. transport bar) */}
      {toolbarPanels.map((panel) => (
        <div key={panel.id}>{panel.config.component()}</div>
      ))}

      {/* Plugin-registered view switcher */}
      {views.length > 0 && <PluginViewSwitcher views={views} />}

      <PanelLayout leftPanels={leftPanels} rightPanels={rightPanels}>
        <ScoreCanvas />
      </PanelLayout>

      <StatusBar />
      <TextInput />
      <SettingsPanel
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
      <PluginPanel
        visible={pluginsVisible}
        onClose={() => setPluginsVisible(false)}
        pluginManager={pluginManagerRef.current}
      />
      <CommandPalette pluginManager={pluginManagerRef.current} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};
