import { create } from "zustand";
import type { ChatMessage, MessageContent, ProviderResponse, ToolDefinition } from "../ai/ChatProvider";
import { getMessageText, getToolUses } from "../ai/ChatProvider";
import { AnthropicProvider } from "../ai/providers/anthropic";
import { OpenAIProvider } from "../ai/providers/openai";
import { GeminiProvider } from "../ai/providers/gemini";
import { buildSystemPrompt, buildScoreContext } from "../ai/ScoreContext";
import { buildToolDefinitions, executeTool } from "../ai/tools";
import { useEditorStore } from "./EditorState";

export type ProviderType = "anthropic" | "openai" | "gemini";

// --- Settings types ---

interface ProviderSettings {
  apiKey: string;
  model: string;
}

export interface AiSettings {
  provider: ProviderType;
  providers: Record<ProviderType, ProviderSettings>;
}

/**
 * Initial default models — only used before the user's first API key entry.
 * After that, the model dropdown fetches real models from the API.
 * Use alias IDs without dates where possible.
 */
const DEFAULT_MODELS: Record<ProviderType, string> = {
  anthropic: "claude-sonnet-4-latest",
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
};

const AI_DEFAULTS: AiSettings = {
  provider: "gemini",
  providers: {
    anthropic: { apiKey: "", model: DEFAULT_MODELS.anthropic },
    openai: { apiKey: "", model: DEFAULT_MODELS.openai },
    gemini: { apiKey: "", model: DEFAULT_MODELS.gemini },
  },
};

// --- Storage ---

import { readDualStorage, writeDualStorage } from "../settings/storage";

const AI_LS_KEY = "nubium-ai-settings";
const AI_CONFIG_FILE = "ai-settings.json";
const CHAT_LS_KEY = "nubium-ai-chat-history";
const CHAT_CONFIG_FILE = "ai-chat-history.json";
const MAX_PERSISTED_MESSAGES = 100;

function loadSettings(): AiSettings {
  const raw = readDualStorage<Record<string, unknown>>(AI_LS_KEY, AI_CONFIG_FILE, AI_DEFAULTS as unknown as Record<string, unknown>);

  // Migration from old format: { provider, apiKey }
  if (raw && typeof raw === "object" && "apiKey" in raw && !("providers" in raw)) {
    const oldProvider = (raw.provider as ProviderType) || "anthropic";
    const oldKey = (raw.apiKey as string) || "";
    const migrated: AiSettings = {
      ...AI_DEFAULTS,
      provider: oldProvider,
      providers: {
        ...AI_DEFAULTS.providers,
        [oldProvider]: { apiKey: oldKey, model: DEFAULT_MODELS[oldProvider] },
      },
    };
    saveSettings(migrated);
    return migrated;
  }

  return { ...AI_DEFAULTS, ...raw } as AiSettings;
}

function saveSettings(settings: AiSettings) {
  writeDualStorage(AI_LS_KEY, AI_CONFIG_FILE, settings);
}

// --- Chat persistence ---

interface PersistedMessage {
  role: "user" | "assistant";
  content: string;
}

function loadChatHistory(): ChatMessage[] {
  const raw = readDualStorage<unknown>(CHAT_LS_KEY, CHAT_CONFIG_FILE, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is PersistedMessage => m && typeof m === "object" && "role" in m && "content" in m)
    .map((m) => ({ role: m.role, content: m.content }));
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSaveChatHistory(messages: ChatMessage[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const toSave: PersistedMessage[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: getMessageText(m) }))
      .filter((m) => m.content.trim().length > 0)
      .slice(-MAX_PERSISTED_MESSAGES);
    writeDualStorage(CHAT_LS_KEY, CHAT_CONFIG_FILE, toSave);
  }, 500);
}

// --- Tool status message helpers ---

/** Build a compact status line for a tool execution */
function toolStatusMessage(name: string, result: string): string {
  try {
    const parsed = JSON.parse(result);
    if (parsed.error) return `\u2717 ${name}: ${parsed.error}`;
    if (name === "execute_command" && parsed.command) {
      return `\u2713 Executed: ${parsed.command}`;
    }
    if (name === "patch_score" && parsed.measuresChanged) {
      const m = parsed.measuresChanged as number[];
      return `\u2713 Applied changes to measure${m.length === 1 ? "" : "s"} ${m.join(", ")}`;
    }
    if (name === "replace_score") {
      return `\u2713 Replaced score (${parsed.parts} parts, ${parsed.measures} measures)`;
    }
    if (name === "get_score") return "\u2713 Read current score";
    if (name === "get_selection") return "\u2713 Read selection";
    return `\u2713 ${name}`;
  } catch {
    return `\u2713 ${name}`;
  }
}

// --- Store ---

const MAX_TOOL_ITERATIONS = 10;

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  // Settings
  settings: AiSettings;
  setProvider(p: ProviderType): void;
  setApiKey(key: string): void;
  setModel(model: string): void;

  // Convenience getters
  provider: ProviderType;
  apiKey: string;

  // Chat
  sendMessage(text: string): Promise<void>;
  addMessage(msg: ChatMessage): void;
  clearMessages(): void;
}

export const useChatStore = create<ChatStore>((set, get) => {
  const initial = loadSettings();

  return {
    messages: loadChatHistory(),
    isLoading: false,
    error: null,

    settings: initial,
    get provider() { return get().settings.provider; },
    get apiKey() { return get().settings.providers[get().settings.provider].apiKey; },

    setProvider(p: ProviderType) {
      set((s) => {
        const settings = { ...s.settings, provider: p };
        saveSettings(settings);
        return { settings };
      });
    },

    setApiKey(key: string) {
      set((s) => {
        const provider = s.settings.provider;
        const settings = {
          ...s.settings,
          providers: {
            ...s.settings.providers,
            [provider]: { ...s.settings.providers[provider], apiKey: key },
          },
        };
        saveSettings(settings);
        return { settings };
      });
    },

    setModel(model: string) {
      set((s) => {
        const provider = s.settings.provider;
        const settings = {
          ...s.settings,
          providers: {
            ...s.settings.providers,
            [provider]: { ...s.settings.providers[provider], model },
          },
        };
        saveSettings(settings);
        return { settings };
      });
    },

    async sendMessage(text: string) {
      const state = get();
      if (state.isLoading) return;

      const { settings } = state;
      const providerSettings = settings.providers[settings.provider];

      if (!providerSettings.apiKey) {
        set({ error: "Please set your API key in the AI settings." });
        return;
      }

      // Add user message
      const userMessage: ChatMessage = { role: "user", content: text };
      const currentMessages = [...state.messages, userMessage];
      set({ messages: currentMessages, isLoading: true, error: null });

      try {
        // Build provider
        const provider = settings.provider === "anthropic"
          ? new AnthropicProvider()
          : settings.provider === "gemini"
            ? new GeminiProvider()
            : new OpenAIProvider();

        // Build system prompt + score context
        const score = useEditorStore.getState().score;
        const systemPrompt = buildSystemPrompt();
        const scoreContext = buildScoreContext(score);

        // Build tools
        const tools = buildToolDefinitions();

        // Build provider config
        const config = {
          model: providerSettings.model,
          maxTokens: 16384,
          providerOptions: {
            apiKey: providerSettings.apiKey,
          },
        };

        // Build conversation for API
        const apiMessages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          { role: "system", content: scoreContext },
          ...currentMessages.filter((m) => m.role !== "system"),
        ];

        // Tool execution loop
        let iterations = 0;
        let response: ProviderResponse;
        const toolStatusLines: string[] = [];

        while (iterations < MAX_TOOL_ITERATIONS) {
          iterations++;
          response = await provider.sendMessage(apiMessages, tools, config);

          // Extract text from response
          const responseText = response.content
            .filter((c) => c.type === "text")
            .map((c) => c.type === "text" ? c.text : "")
            .join("");

          if (response.stopReason === "end_turn") {
            // Done — build final message with tool status + text
            const parts: string[] = [];
            if (toolStatusLines.length > 0) parts.push(toolStatusLines.join("\n"));
            if (responseText.trim()) parts.push(responseText.trim());
            const finalContent = parts.join("\n\n") || (toolStatusLines.length > 0 ? "\u2713 Done" : "No changes made.");

            const newMessages = [
              ...get().messages,
              { role: "assistant" as const, content: finalContent },
            ];
            set({ messages: newMessages, isLoading: false });
            scheduleSaveChatHistory(newMessages);
            return;
          }

          // Tool use — execute tools and continue
          const assistantContent: MessageContent[] = response.content;
          apiMessages.push({ role: "assistant", content: assistantContent });

          const toolResults: MessageContent[] = [];
          const toolUses = getToolUses({ role: "assistant", content: assistantContent });

          for (const toolUse of toolUses) {
            const result = executeTool({
              id: toolUse.id,
              name: toolUse.name,
              arguments: toolUse.input,
            });

            toolStatusLines.push(toolStatusMessage(toolUse.name, result.content));

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result.content,
              is_error: result.isError,
            });
          }

          apiMessages.push({ role: "user", content: toolResults });
        }

        // Hit max iterations
        const parts: string[] = [];
        if (toolStatusLines.length > 0) parts.push(toolStatusLines.join("\n"));
        parts.push("Reached maximum tool iterations.");
        const newMessages = [
          ...get().messages,
          { role: "assistant" as const, content: parts.join("\n\n") },
        ];
        set({ messages: newMessages, isLoading: false });
        scheduleSaveChatHistory(newMessages);
      } catch (err) {
        let message = err instanceof Error ? err.message : "Unknown error occurred";
        // Sanitize API keys from error messages
        message = message.replace(/sk-ant-[a-zA-Z0-9_-]+/g, "sk-ant-***");
        message = message.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "sk-***");
        message = message.replace(/AIza[a-zA-Z0-9_-]+/g, "AIza***");
        set({ isLoading: false, error: message });
      }
    },

    addMessage(msg: ChatMessage) {
      set((state) => {
        const messages = [...state.messages, msg];
        scheduleSaveChatHistory(messages);
        return { messages };
      });
    },

    clearMessages() {
      set({ messages: [], error: null });
      writeDualStorage(CHAT_LS_KEY, CHAT_CONFIG_FILE, []);
    },
  };
});
