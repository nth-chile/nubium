import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "../state/ChatState";
import { AISettings } from "./AISettings";
import { PRESET_COMMANDS } from "../ai/presets";

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 360;

export function ChatSidebar({ visible }: { visible: boolean }) {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const error = useChatStore((s) => s.error);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);

  const [input, setInput] = useState("");
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(text);
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handlePreset = useCallback(
    (command: string) => {
      if (command === "/transpose") {
        setInput("/transpose ");
        return;
      }
      sendMessage(command);
    },
    [sendMessage]
  );

  // Resize handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [width]);

  if (!visible) return null;

  return (
    <div style={{ ...styles.sidebar, width }}>
      {/* Resize handle */}
      <div style={styles.resizeHandle} onMouseDown={handleMouseDown} />

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>AI Chat</span>
        <div style={styles.headerButtons}>
          <button
            style={styles.headerBtn}
            onClick={() => setShowSettings((s) => !s)}
            title="Settings"
          >
            {showSettings ? "Chat" : "Settings"}
          </button>
          <button
            style={styles.headerBtn}
            onClick={clearMessages}
            title="Clear chat"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && <AISettings />}

      {/* Messages */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 && !showSettings && (
          <div style={styles.emptyState}>
            <div style={styles.emptyTitle}>Ask AI about your score</div>
            <div style={styles.emptyHint}>
              The AI can read your score and make edits. Try asking it to add
              harmonies, transpose, or explain music theory.
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const hasApplyStatus = msg.role === "assistant" && msg.content.startsWith("\u2713 ");
          const isError = msg.role === "assistant" && msg.content.startsWith("I couldn't apply that edit:");
          return (
            <div
              key={i}
              style={{
                ...styles.message,
                ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage),
                ...(hasApplyStatus ? styles.appliedMessage : {}),
                ...(isError ? styles.errorMessage : {}),
              }}
            >
              <div style={styles.messageRole}>
                {msg.role === "user" ? "You" : "AI"}
              </div>
              <div style={styles.messageContent}>
                {formatMessageContent(msg.content)}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div style={{ ...styles.message, ...styles.assistantMessage }}>
            <div style={styles.messageRole}>AI</div>
            <div style={styles.loadingDots}>Thinking...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error (shown above input so it's always visible) */}
      {error && (
        <div style={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* Presets */}
      <div style={styles.presets}>
        {PRESET_COMMANDS.map((preset) => (
          <button
            key={preset.command}
            style={styles.presetBtn}
            onClick={() => handlePreset(preset.command)}
            title={preset.description}
            disabled={isLoading}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={styles.inputContainer}>
        <textarea
          style={styles.textarea}
          placeholder="Ask AI to edit your score..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isLoading}
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: isLoading || !input.trim() ? 0.5 : 1,
          }}
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

/** Simple formatting: render code blocks differently */
function formatMessageContent(content: string): React.ReactNode {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const inner = part.replace(/^```\w*\n?/, "").replace(/```$/, "");
      return (
        <pre key={i} style={styles.codeBlock}>
          <code>{inner}</code>
        </pre>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#1e1e1e",
    borderLeft: "1px solid #333",
    position: "relative",
    flexShrink: 0,
  },
  resizeHandle: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    cursor: "col-resize",
    zIndex: 10,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: "1px solid #333",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#eee",
  },
  headerButtons: {
    display: "flex",
    gap: 6,
  },
  headerBtn: {
    background: "#2a2a2a",
    border: "1px solid #444",
    color: "#ccc",
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 4,
    cursor: "pointer",
  },
  messagesContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#777",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 8,
    color: "#999",
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: "1.5",
  },
  message: {
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    lineHeight: "1.5",
    maxWidth: "100%",
    wordWrap: "break-word",
  },
  userMessage: {
    background: "#2d3748",
    color: "#e2e8f0",
    alignSelf: "flex-end",
  },
  assistantMessage: {
    background: "#2a2a2a",
    color: "#e2e8f0",
    alignSelf: "flex-start",
  },
  appliedMessage: {
    background: "#1a2e1a",
    borderLeft: "3px solid #4ade80",
  },
  errorMessage: {
    background: "#2e1a1a",
    borderLeft: "3px solid #f87171",
  },
  messageRole: {
    fontSize: 10,
    fontWeight: 700,
    color: "#888",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  messageContent: {
    whiteSpace: "pre-wrap",
  },
  loadingDots: {
    color: "#888",
    fontStyle: "italic",
  },
  errorBox: {
    background: "#3b1c1c",
    color: "#f88",
    border: "1px solid #622",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 12,
  },
  errorBanner: {
    background: "#3b1c1c",
    color: "#f88",
    border: "1px solid #622",
    padding: "8px 12px",
    fontSize: 12,
    flexShrink: 0,
  },
  presets: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    padding: "6px 12px",
    borderTop: "1px solid #333",
    flexShrink: 0,
  },
  presetBtn: {
    background: "#2a2a2a",
    border: "1px solid #444",
    color: "#ccc",
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  inputContainer: {
    display: "flex",
    gap: 6,
    padding: "8px 12px",
    borderTop: "1px solid #333",
    flexShrink: 0,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    background: "#2a2a2a",
    color: "#eee",
    border: "1px solid #444",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 13,
    fontFamily: "inherit",
    resize: "none",
    outline: "none",
    lineHeight: "1.4",
  },
  sendBtn: {
    background: "#4a7dff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  codeBlock: {
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: 11,
    fontFamily: "monospace",
    overflowX: "auto",
    margin: "4px 0",
    whiteSpace: "pre-wrap",
  },
};
