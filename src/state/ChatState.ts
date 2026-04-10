import { create } from "zustand";
import type { ChatMessage, MessageContent, ProviderResponse } from "../ai/ChatProvider";
import { getMessageText, getToolUses } from "../ai/ChatProvider";
import { AnthropicProvider } from "../ai/providers/anthropic";
import { OpenAIProvider } from "../ai/providers/openai";
import { GeminiProvider } from "../ai/providers/gemini";
import { buildSystemPrompt, buildScoreContext } from "../ai/ScoreContext";
import { buildToolDefinitions, executeTool } from "../ai/tools";
import { useEditorStore } from "./EditorState";
import { readDualStorage, writeDualStorage } from "../settings/storage";

// --- Types ---

export type ProviderType = "anthropic" | "openai" | "gemini";

export interface AiSettings {
  provider: ProviderType;
  providers: Record<ProviderType, { apiKey: string; model: string }>;
}

// --- Defaults ---

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

// --- Storage keys ---

const SETTINGS_LS = "nubium-ai-settings";
const SETTINGS_FILE = "ai-settings.json";

// --- Settings persistence ---

function loadSettings(): AiSettings {
  const raw = readDualStorage<Record<string, unknown>>(
    SETTINGS_LS, SETTINGS_FILE, AI_DEFAULTS as unknown as Record<string, unknown>,
  );
  // Migrate old format: { provider, apiKey }
  if (raw && "apiKey" in raw && !("providers" in raw)) {
    const p = (raw.provider as ProviderType) || "anthropic";
    const migrated: AiSettings = {
      ...AI_DEFAULTS,
      provider: p,
      providers: { ...AI_DEFAULTS.providers, [p]: { apiKey: raw.apiKey as string, model: DEFAULT_MODELS[p] } },
    };
    writeDualStorage(SETTINGS_LS, SETTINGS_FILE, migrated);
    return migrated;
  }
  return { ...AI_DEFAULTS, ...raw } as AiSettings;
}

// No chat persistence — fresh context each session. The score is the context.

// --- Tool status formatting ---

function formatToolStatus(name: string, resultJson: string): string {
  try {
    const r = JSON.parse(resultJson);
    if (r.error) return `\u2717 ${name}: ${r.error}`;
    if (name === "execute_command") return `\u2713 Executed: ${r.command}`;
    if (name === "patch_score") return `\u2713 Applied changes to measure${(r.measuresChanged as number[]).length === 1 ? "" : "s"} ${(r.measuresChanged as number[]).join(", ")}`;
    if (name === "replace_score") return `\u2713 Replaced score (${r.parts} parts, ${r.measures} measures)`;
    if (name === "get_score") return "\u2713 Read current score";
    if (name === "get_selection") return "\u2713 Read selection";
  } catch { /* */ }
  return `\u2713 ${name}`;
}

// --- Store ---

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  settings: AiSettings;

  setProvider(p: ProviderType): void;
  setApiKey(key: string): void;
  setModel(model: string): void;
  sendMessage(text: string): Promise<void>;
  clearMessages(): void;

  // Convenience
  provider: ProviderType;
  apiKey: string;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  settings: loadSettings(),

  get provider() { return get().settings.provider; },
  get apiKey() { return get().settings.providers[get().settings.provider].apiKey; },

  setProvider(p) {
    set((s) => {
      const settings = { ...s.settings, provider: p };
      writeDualStorage(SETTINGS_LS, SETTINGS_FILE, settings);
      return { settings };
    });
  },

  setApiKey(key) {
    set((s) => {
      const p = s.settings.provider;
      const settings = { ...s.settings, providers: { ...s.settings.providers, [p]: { ...s.settings.providers[p], apiKey: key } } };
      writeDualStorage(SETTINGS_LS, SETTINGS_FILE, settings);
      return { settings };
    });
  },

  setModel(model) {
    set((s) => {
      const p = s.settings.provider;
      const settings = { ...s.settings, providers: { ...s.settings.providers, [p]: { ...s.settings.providers[p], model } } };
      writeDualStorage(SETTINGS_LS, SETTINGS_FILE, settings);
      return { settings };
    });
  },

  async sendMessage(text) {
    const state = get();
    if (state.isLoading) return;

    const { settings } = state;
    const ps = settings.providers[settings.provider];
    if (!ps.apiKey) { set({ error: "Set your API key in AI settings." }); return; }

    // Add user message
    const messages = [...state.messages, { role: "user" as const, content: text }];
    set({ messages, isLoading: true, error: null });

    try {
      const provider = settings.provider === "anthropic" ? new AnthropicProvider()
        : settings.provider === "gemini" ? new GeminiProvider()
        : new OpenAIProvider();

      const score = useEditorStore.getState().score;
      const tools = buildToolDefinitions();
      const config = { model: ps.model, maxTokens: 16384, providerOptions: { apiKey: ps.apiKey } };

      // API messages: system prompt + score + last 10 messages (to cap cost)
      const recentMessages = messages.slice(-10).filter((m) => m.role !== "system").map((m) => {
        if (m.role !== "assistant") return m;
        const clean = getMessageText(m).split("\n").filter((l) => !/^[✓✗] /.test(l) && l !== "No changes made.").join("\n").trim();
        return { ...m, content: clean || "Done." };
      });
      const apiMessages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt() },
        { role: "system", content: buildScoreContext(score) },
        ...recentMessages,
      ];

      // Tool loop
      const statusLines: string[] = [];
      for (let i = 0; i < 10; i++) {
        const response: ProviderResponse = await provider.sendMessage(apiMessages, tools, config);
        const responseText = response.content.filter((c) => c.type === "text").map((c) => c.type === "text" ? c.text : "").join("");

        if (response.stopReason === "end_turn") {
          const parts = [...(statusLines.length ? [statusLines.join("\n")] : []), ...(responseText.trim() ? [responseText.trim()] : [])];
          const content = parts.join("\n\n") || (statusLines.length ? "\u2713 Done" : "No changes made.");
          const updated = [...get().messages, { role: "assistant" as const, content }];
          set({ messages: updated, isLoading: false });
                    return;
        }

        // Execute tool calls
        apiMessages.push({ role: "assistant", content: response.content });
        const results: MessageContent[] = [];
        for (const tc of getToolUses({ role: "assistant", content: response.content })) {
          const result = executeTool({ id: tc.id, name: tc.name, arguments: tc.input });
          statusLines.push(formatToolStatus(tc.name, result.content));
          results.push({ type: "tool_result", tool_use_id: tc.id, content: result.content, is_error: result.isError });
        }
        apiMessages.push({ role: "user", content: results });
      }

      // Max iterations
      const updated = [...get().messages, { role: "assistant" as const, content: statusLines.join("\n") + "\n\nReached maximum tool iterations." }];
      set({ messages: updated, isLoading: false });
          } catch (err) {
      const msg = (err instanceof Error ? err.message : "Unknown error")
        .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "sk-ant-***")
        .replace(/sk-[a-zA-Z0-9_-]{20,}/g, "sk-***")
        .replace(/AIza[a-zA-Z0-9_-]+/g, "AIza***");
      set({ isLoading: false, error: msg });
    }
  },

  clearMessages() {
    set({ messages: [], error: null });
  },
}));
