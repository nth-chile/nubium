import { useState, useRef, useEffect, useCallback } from "react";
import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import { useChatStore } from "../../state/ChatState";
import { useEditorStore } from "../../state";
import { getMessageText } from "../../ai/ChatProvider";
import { AISettings } from "../../components/AISettings";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Trash2 } from "lucide-react";

// Module-level refs so the menu item can toggle/read settings even across remounts
let toggleSettingsRef: (() => void) | null = null;
let isSettingsOpenRef = false;

function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const error = useChatStore((s) => s.error);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    toggleSettingsRef = () => setShowSettings((s) => !s);
    return () => { toggleSettingsRef = null; isSettingsOpenRef = false; };
  }, []);

  useEffect(() => { isSettingsOpenRef = showSettings; }, [showSettings]);

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

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {showSettings && <AISettings onClose={() => setShowSettings(false)} />}

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-2 min-h-0">
        {messages.length === 0 && !showSettings && (
          <div className="text-center py-6 text-muted-foreground">
            <div className="text-xs leading-relaxed">
              Ask AI to edit your score. Enter sends.
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const text = getMessageText(msg);
          const hasToolStatus = msg.role === "assistant" && text.includes("\u2713 ");
          const hasError = msg.role === "assistant" && text.includes("\u2717 ");
          return (
            <div
              key={i}
              className={`rounded-md px-2.5 py-1.5 text-xs leading-relaxed max-w-full break-words ${
                msg.role === "user"
                  ? "bg-secondary self-end"
                  : hasError
                    ? "bg-red-950/40 border-l-2 border-red-500 self-start"
                    : hasToolStatus
                      ? "bg-green-950/40 border-l-2 border-green-500 self-start"
                      : "bg-secondary/50 self-start"
              }`}
            >
              <div className="text-[10px] font-bold text-muted-foreground mb-0.5 uppercase">
                {msg.role === "user" ? "You" : "AI"}
              </div>
              <div className="whitespace-pre-wrap break-words">
                {formatMessageContent(text)}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="bg-secondary/50 rounded-md px-2.5 py-1.5 text-xs self-start">
            <div className="text-[10px] font-bold text-muted-foreground mb-0.5 uppercase">AI</div>
            <div className="text-muted-foreground italic">Thinking...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="bg-red-950/30 text-red-400 border border-red-900 px-2.5 py-1.5 text-xs shrink-0">
          {error}
        </div>
      )}

      <div className="p-2 border-t shrink-0">
        <Textarea
          className="min-h-[36px] text-xs"
          placeholder="Ask AI... (Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}


function formatMessageContent(content: string): React.ReactNode {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const inner = part.replace(/^```\w*\n?/, "").replace(/```$/, "");
      return (
        <pre key={i} className="bg-background border rounded p-1.5 text-[11px] font-mono overflow-x-auto my-1 whitespace-pre-wrap">
          <code>{inner}</code>
        </pre>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export const AIChatPlugin: NubiumPlugin = {
  id: "nubium.ai-chat",
  name: "AI Chat",
  version: "1.0.0",
  description: "AI-powered chat sidebar for score editing assistance",

  activate(api: PluginAPI) {
    api.registerPanel("ai.chat", {
      title: "AI Chat",
      location: "sidebar-right",
      component: () => <ChatPanel />,
      defaultEnabled: true,
      fill: true,
      headerActions: () => [
        {
          icon: Trash2,
          title: "Clear Chat",
          onClick: () => useChatStore.getState().clearMessages(),
        },
        {
          icon: Settings,
          title: "AI Settings",
          onClick: () => toggleSettingsRef?.(),
        },
      ],
    });

    api.registerCommand("nubium.toggle-chat", "Toggle AI Chat", () => {});
    api.registerShortcut("Ctrl+Shift+A", "nubium.toggle-chat");
  },
};
