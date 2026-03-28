import { ScoreCanvas } from "./components/ScoreCanvas";
import { Toolbar } from "./components/Toolbar";
import { TransportBar } from "./components/TransportBar";
import { StatusBar } from "./components/StatusBar";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { TextInput } from "./components/TextInput";
import { PartPanel } from "./components/PartPanel";
import { ChatSidebar } from "./components/ChatSidebar";
import { ViewSwitcher } from "./components/ViewSwitcher";
import { SettingsPanel } from "./components/SettingsPanel";
import { PluginPanel } from "./components/PluginPanel";
import { CommandPalette } from "./components/CommandPalette";
import { useEditorStore } from "./state";
import { saveScore } from "./fileio/save";
import { loadScore } from "./fileio/load";
import { useEffect, useCallback, useState, useRef } from "react";
import { PluginManager, TransposePlugin, RetrogradePlugin, AugmentPlugin, ChordAnalysisPlugin } from "./plugins";

export function App() {
  const score = useEditorStore((s) => s.score);
  const filePath = useEditorStore((s) => s.filePath);
  const setScore = useEditorStore((s) => s.setScore);
  const setFilePath = useEditorStore((s) => s.setFilePath);
  const [chatVisible, setChatVisible] = useState(false);
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

    // Register and activate built-in plugins
    const pm = pluginManagerRef.current;
    pm.register(TransposePlugin);
    pm.register(RetrogradePlugin);
    pm.register(AugmentPlugin);
    pm.register(ChordAnalysisPlugin);
    pm.activate(TransposePlugin.id);
    pm.activate(RetrogradePlugin.id);
    pm.activate(AugmentPlugin.id);
    pm.activate(ChordAnalysisPlugin.id);
  }

  const handleSave = useCallback(async () => {
    try {
      const path = await saveScore(score, filePath ?? undefined);
      setFilePath(path);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [score, filePath, setFilePath]);

  const handleOpen = useCallback(async () => {
    try {
      const result = await loadScore();
      if (result) {
        setScore(result.score);
        setFilePath(result.path);
      }
    } catch (err) {
      console.error("Load failed:", err);
    }
  }, [setScore, setFilePath]);

  // Ctrl+S / Ctrl+O / Ctrl+Shift+A
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
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        setChatVisible((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleOpen]);

  return (
    <div style={styles.app}>
      <KeyboardShortcuts />
      <Toolbar
        onToggleChat={() => setChatVisible((v) => !v)}
        chatVisible={chatVisible}
        onToggleSettings={() => setSettingsVisible((v) => !v)}
        onTogglePlugins={() => setPluginsVisible((v) => !v)}
      />
      <TransportBar />
      <ViewSwitcher />
      <div style={styles.mainContent}>
        <PartPanel />
        <ScoreCanvas />
        <ChatSidebar visible={chatVisible} />
      </div>
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
  mainContent: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
};
