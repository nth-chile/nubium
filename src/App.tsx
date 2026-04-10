import { ScoreCanvas } from "./components/ScoreCanvas";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { KeyboardShortcuts, emitFlash } from "./components/KeyboardShortcuts";
import { TextInput } from "./components/TextInput";
import { SettingsPanel } from "./components/SettingsPanel";
import { PluginPanel } from "./components/PluginPanel";
import { CommandPalette } from "./components/CommandPalette";
import { HistoryModal, showHistoryModal } from "./components/HistoryModal";
import { ToastContainer, showToast } from "./components/Toast";
import { PanelLayout } from "./components/PanelLayout";
import { TooltipProvider } from "./components/ui/tooltip";
import { useEditorStore } from "./state";
import { useLayoutStore } from "./state/LayoutState";
import { saveScore } from "./fileio/save";
import { loadScore } from "./fileio/load";
import { emptyScore } from "./model/factory";
import { getSettings, matchesBinding } from "./settings";
import { recordSave } from "./licensing";
import { LicenseNag } from "./components/LicenseNag";
import { useEffect, useCallback, useState, useSyncExternalStore, useRef } from "react";
import { checkForUpdates, installUpdate } from "./updater";
import {
  PluginManager,
  TransposePlugin,
  ChordAnalysisPlugin,
  ExportPlugin,
  BuiltinInstrumentsPlugin,
  AIChatPlugin,
  registerCorePartManager,
  registerCoreEditor,
  registerCoreTransport,
  ClipboardPlugin,
  MidiInputPlugin,
  GuitarPlugin,
  TechniquesPlugin,
  GuitarProImportPlugin,
} from "./plugins";
import { setGlobalPluginManager } from "./plugins/PluginManager";
import { isCommunityPluginsEnabled, loadAllInstalled } from "./plugins/CommunityRegistry";

export function App() {
  const score = useEditorStore((s) => s.score);
  const filePath = useEditorStore((s) => s.filePath);
  const setScore = useEditorStore((s) => s.setScore);
  const setFilePath = useEditorStore((s) => s.setFilePath);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [pluginsVisible, setPluginsVisible] = useState(false);
  const [nagVisible, setNagVisible] = useState(false);

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
        showToast(message, type);
      },
      getPlaybackState: () => {
        const s = useEditorStore.getState();
        return { isPlaying: s.isPlaying, tick: s.playbackTick };
      },
      getMeasurePositions: () => useEditorStore.getState().measurePositions,
      play: () => useEditorStore.getState().play() as Promise<void>,
      pause: () => useEditorStore.getState().pause(),
      stop: () => useEditorStore.getState().stopPlayback(),
      seekToMeasure: (measureIndex: number) => {
        const store = useEditorStore.getState();
        const cursor = store.inputState.cursor;
        store.setCursorDirect({ ...cursor, measureIndex, eventIndex: 0 });
      },
      scrollToMeasure: (measureIndex: number) => {
        const positions = useEditorStore.getState().measurePositions;
        const pos = positions.find((p) => p.measureIndex === measureIndex);
        if (!pos) return;
        const container = document.querySelector("[data-score-container]");
        if (container) {
          container.scrollTo({ top: pos.y - 40, behavior: "smooth" });
        }
      },
    });

    const pm = pluginManagerRef.current;

    // Register core features (always active, not plugins)
    registerCoreEditor(pm);
    registerCorePartManager(pm);
    registerCoreTransport(pm);

    // Register and activate built-in plugins
    pm.registerAndActivate(BuiltinInstrumentsPlugin, true);
    pm.registerAndActivate(AIChatPlugin, true);
    pm.registerAndActivate(ExportPlugin, true);

    // Register and activate built-in transform plugins
    pm.registerAndActivate(TransposePlugin, true);
    pm.registerAndActivate(ChordAnalysisPlugin, true);
    pm.registerAndActivate(ClipboardPlugin, false);
    pm.registerAndActivate(MidiInputPlugin, false);
    pm.registerAndActivate(GuitarPlugin, true);
    pm.registerAndActivate(TechniquesPlugin, true);
    // GuitarProImportPlugin disabled — needs real-world testing with .gp files before enabling
    // pm.registerAndActivate(GuitarProImportPlugin, true);

    // Load installed community plugins
    if (isCommunityPluginsEnabled()) {
      for (const plugin of loadAllInstalled()) {
        pm.registerAndActivate(plugin, true);
      }
    }

    setGlobalPluginManager(pm);

    // Subscribe to state changes and emit plugin events
    let prevScore = useEditorStore.getState().score;
    let prevSelection = useEditorStore.getState().selection;
    let prevCursor = useEditorStore.getState().inputState.cursor;
    let prevIsPlaying = useEditorStore.getState().isPlaying;
    useEditorStore.subscribe((state) => {
      if (state.score !== prevScore) {
        prevScore = state.score;
        pm.emitEvent("scoreChanged", state.score);
      }
      if (state.selection !== prevSelection) {
        prevSelection = state.selection;
        pm.emitEvent("selectionChanged", state.selection);
      }
      if (state.inputState.cursor !== prevCursor) {
        prevCursor = state.inputState.cursor;
        pm.emitEvent("cursorChanged", state.inputState.cursor);
      }
      if (state.isPlaying !== prevIsPlaying) {
        prevIsPlaying = state.isPlaying;
        pm.emitEvent("playbackStateChanged", { isPlaying: state.isPlaying, tick: state.playbackTick });
      }
    });

    // Updater commands
    pm.registerCoreCommand("nubium.check-updates", "Check for Updates", () => checkForUpdates(true));
    pm.registerCoreCommand("nubium.install-update", "Install Update and Restart", () => installUpdate());
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
  const saveConfirmed = useEditorStore((s) => s.saveConfirmed);
  const fileHandle = useEditorStore((s) => s.fileHandle);
  const handleSave = useCallback(async () => {
    try {
      // Show dialog on first save after opening/importing a file, so user confirms destination
      const needsDialog = !saveConfirmed;
      const result = await saveScore(score, filePath ?? undefined, useEditorStore.getState().viewConfig, needsDialog, fileHandle);
      // Set path, handle, and confirmed atomically to avoid resetting each other
      useEditorStore.setState({
        filePath: result.path,
        ...(result.handle ? { fileHandle: result.handle } : {}),
        saveConfirmed: true,
      });
      useEditorStore.getState().markClean();
      useEditorStore.getState().setAutoSaveStatus("Saved");
      if (recordSave()) setNagVisible(true);
    } catch (err) {
      // AbortError = user cancelled the File System Access picker
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Save failed:", err);
    }
  }, [score, filePath, fileHandle, saveConfirmed, setFilePath]);

  const handleNew = useCallback(async () => {
    setScore(emptyScore());
    setFilePath(null);
    useEditorStore.getState().markClean();
    useEditorStore.getState().setAutoSaveStatus(null);
    localStorage.removeItem("nubium-autosave");
    // Clear Tauri recovery file
    try {
      const [fs, pathMod] = await Promise.all([
        import("@tauri-apps/plugin-fs"),
        import("@tauri-apps/api/path"),
      ]);
      const dataDir = await pathMod.appDataDir();
      await fs.remove(`${dataDir}recovery/recovery.json`);
    } catch {
      // not in Tauri or file doesn't exist
    }
  }, [setScore, setFilePath]);

  const handleOpen = useCallback(async () => {
    try {
      const result = await loadScore();
      if (!result) return;
      setScore(result.score);
      setFilePath(result.path);
      // Restore view config: prefer Nubium's saved viewConfig, fall back to MusicXML display hints
      if (result.viewConfig) {
        useEditorStore.setState({ viewConfig: result.viewConfig });
      } else if (Object.keys(result.displayHints).length > 0) {
        for (const [pi, hints] of Object.entries(result.displayHints)) {
          const display: { standard?: boolean; tab?: boolean; slash?: boolean } = {};
          if (hints.slash) { display.slash = true; display.standard = false; }
          if (hints.tab) { display.tab = true; display.standard = false; }
          useEditorStore.getState().setPartNotation(Number(pi), display);
        }
      }
      useEditorStore.getState().markClean();
      useEditorStore.getState().setAutoSaveStatus(null);
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
          emitFlash(actionId);
          return;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleOpen]);

  // Suppress unused variable warning — pluginVersion is used to trigger re-renders
  void pluginVersion;

  // Check for updates on launch (Tauri only, non-blocking)
  useEffect(() => {
    checkForUpdates();
  }, []);

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
      <LicenseNag open={nagVisible} onClose={() => setNagVisible(false)} />
      <ToastContainer />
    </div>
    </TooltipProvider>
  );
}

