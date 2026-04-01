import { ScoreCanvas } from "./components/ScoreCanvas";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { TextInput } from "./components/TextInput";
import { SettingsPanel } from "./components/SettingsPanel";
import { PluginPanel } from "./components/PluginPanel";
import { CommandPalette } from "./components/CommandPalette";
import { HistoryModal, showHistoryModal } from "./components/HistoryModal";
import { PanelLayout } from "./components/PanelLayout";
import { TooltipProvider } from "./components/ui/tooltip";
import { useEditorStore } from "./state";
import { useLayoutStore } from "./state/LayoutState";
import { saveScore } from "./fileio/save";
import { loadScore } from "./fileio/load";
import { emptyScore } from "./model/factory";
import { getSettings, matchesBinding } from "./settings";
import { useEffect, useCallback, useState, useSyncExternalStore, useRef } from "react";
import {
  PluginManager,
  TransposePlugin,
  ChordAnalysisPlugin,
  ViewsPlugin,
  ExportPlugin,
  PlaybackPlugin,
  AIChatPlugin,
  PartManagerPlugin,
  ScoreEditorPlugin,
  ClipboardPlugin,
  SoundFontPlugin,
  MidiInputPlugin,
} from "./plugins";
import { setGlobalPluginManager } from "./plugins/PluginManager";

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
      getSelection: () => useEditorStore.getState().selection,
      showNotification: (message, type) => {
        console.log(`[${type ?? "info"}] ${message}`);
      },
    });

    const pm = pluginManagerRef.current;

    // Register and activate built-in feature plugins
    pm.registerAndActivate(ViewsPlugin, false);
    pm.registerAndActivate(PlaybackPlugin, true);
    pm.registerAndActivate(AIChatPlugin, true);
    pm.registerAndActivate(PartManagerPlugin, true);
    pm.registerAndActivate(ExportPlugin, true);
    pm.registerAndActivate(ScoreEditorPlugin, true);

    // Register and activate built-in transform plugins
    pm.registerAndActivate(TransposePlugin, true);
    pm.registerAndActivate(ChordAnalysisPlugin, true);
    pm.registerAndActivate(ClipboardPlugin, false);
    pm.registerAndActivate(SoundFontPlugin, false);
    pm.registerAndActivate(MidiInputPlugin, false);

    setGlobalPluginManager(pm);
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
      const path = await saveScore(score, filePath ?? undefined);
      setFilePath(path);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [score, filePath, setFilePath]);

  const handleNew = useCallback(() => {
    setScore(emptyScore());
    setFilePath(null);
    localStorage.removeItem("NOTATION_AUTOSAVE");
  }, [setScore, setFilePath]);

  const handleOpen = useCallback(async () => {
    try {
      const result = await loadScore();
      if (!result) return;
      setScore(result.score);
      setFilePath(result.path);
    } catch (err) {
      console.error("Load failed:", err);
    }
  }, [setScore, setFilePath]);

  // File & UI shortcuts (uses customizable keybindings)
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      "file:new": () => handleNew(),
      "file:save": () => handleSave(),
      "file:open": () => handleOpen(),
      "toggle-settings": () => setSettingsVisible((v) => !v),
      "toggle-left-sidebar": () => useLayoutStore.getState().toggleSidebar("left"),
      "toggle-right-sidebar": () => useLayoutStore.getState().toggleSidebar("right"),
      "toggle-plugins": () => setPluginsVisible((v) => !v),
      "file-history": () => showHistoryModal(),
    };
    function handleKeyDown(e: KeyboardEvent) {
      const bindings = getSettings().keyBindings;
      for (const [actionId, binding] of Object.entries(bindings)) {
        if (handlers[actionId] && matchesBinding(e, binding)) {
          e.preventDefault();
          handlers[actionId]();
          return;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleOpen]);

  // Suppress unused variable warning — pluginVersion is used to trigger re-renders
  void pluginVersion;

  return (
    <TooltipProvider delayDuration={600} skipDelayDuration={400}>
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <KeyboardShortcuts />
      <Toolbar
        onToggleSettings={() => setSettingsVisible((v) => !v)}
        onTogglePlugins={() => setPluginsVisible((v) => !v)}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        toolbarPanels={toolbarPanels}
        views={views}
      />

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
      <HistoryModal />
    </div>
    </TooltipProvider>
  );
}

