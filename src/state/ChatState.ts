import { create } from "zustand";
import type { ChatMessage } from "../ai/ChatProvider";
import { AnthropicProvider } from "../ai/providers/anthropic";
import { OpenAIProvider } from "../ai/providers/openai";
import { GeminiProvider } from "../ai/providers/gemini";
import {
  buildSystemPrompt,
  buildScoreContext,
  extractScoreFromResponse,
} from "../ai/ScoreContext";
import { applyAIEdit } from "../ai/DiffApply";
import { expandPreset } from "../ai/presets";
import { useEditorStore } from "./EditorState";

export type ProviderType = "anthropic" | "openai" | "gemini";

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  provider: ProviderType;
  apiKey: string;
  error: string | null;

  sendMessage(text: string): Promise<void>;
  setProvider(p: ProviderType): void;
  setApiKey(key: string): void;
  clearMessages(): void;
}

function loadSettings(): { provider: ProviderType; apiKey: string } {
  try {
    const stored = localStorage.getItem("notation-ai-settings");
    if (stored) {
      const parsed = JSON.parse(stored) as {
        provider?: string;
        apiKey?: string;
      };
      return {
        provider: (parsed.provider as ProviderType) ?? "anthropic",
        apiKey: parsed.apiKey ?? "",
      };
    }
  } catch {
    // ignore
  }
  return { provider: "anthropic", apiKey: "" };
}

function saveSettings(provider: ProviderType, apiKey: string) {
  try {
    localStorage.setItem(
      "notation-ai-settings",
      JSON.stringify({ provider, apiKey })
    );
  } catch {
    // ignore
  }
}

export const useChatStore = create<ChatStore>((set, get) => {
  const initial = loadSettings();

  return {
    messages: [],
    isLoading: false,
    provider: initial.provider,
    apiKey: initial.apiKey,
    error: null,

    async sendMessage(text: string) {
      const state = get();
      if (state.isLoading) return;
      if (!state.apiKey) {
        set({ error: "Please set your API key in the AI settings." });
        return;
      }

      // Check for preset commands
      const expandedPrompt = expandPreset(text);
      const userText = expandedPrompt ?? text;

      // Add user message
      const userMessage: ChatMessage = { role: "user", content: text };
      set({
        messages: [...state.messages, userMessage],
        isLoading: true,
        error: null,
      });

      try {
        // Build provider
        const provider =
          state.provider === "anthropic"
            ? new AnthropicProvider(state.apiKey)
            : state.provider === "gemini"
              ? new GeminiProvider(state.apiKey)
              : new OpenAIProvider(state.apiKey);

        // Build context
        const score = useEditorStore.getState().score;
        const systemPrompt = buildSystemPrompt();
        const scoreContext = buildScoreContext(score);

        // Build message list
        const allMessages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          { role: "system", content: scoreContext },
          // Include previous conversation (skip system messages)
          ...state.messages.filter((m) => m.role !== "system"),
          { role: "user", content: userText },
        ];

        const responseText = await provider.sendMessage(allMessages);

        // Try to extract and apply JSON patch from response
        const notationText = extractScoreFromResponse(responseText);
        if (notationText) {
          const result = applyAIEdit(score, notationText);
          if (result.ok) {
            // Apply to editor state
            useEditorStore.getState().setScore(result.score);
            useEditorStore.setState({ isDirty: true });

            // Build a display message: strip code block, add status
            const displayText = stripCodeBlock(responseText);
            const summary = buildApplySummary(notationText);
            const content = displayText.trim()
              ? `${displayText.trim()}\n\n${summary}`
              : summary;

            set((s) => ({
              messages: [
                ...s.messages,
                { role: "assistant" as const, content },
              ],
              isLoading: false,
            }));
            return;
          }

          // Validation errors or parse errors — retry with specific feedback
          const errorMsg = "validationErrors" in result
            ? result.validationErrors
            : ("error" in result ? result.error : "Unknown error");

          const retryMessages: ChatMessage[] = [
            ...allMessages,
            { role: "assistant", content: responseText },
            { role: "user", content: errorMsg },
          ];

          try {
            const retryText = await provider.sendMessage(retryMessages);
            const retryJson = extractScoreFromResponse(retryText);
            if (retryJson) {
              const retryResult = applyAIEdit(score, retryJson);
              if (retryResult.ok) {
                useEditorStore.getState().setScore(retryResult.score);
                useEditorStore.setState({ isDirty: true });

                const displayText = stripCodeBlock(retryText);
                const summary = buildApplySummary(retryJson);
                const content = displayText.trim()
                  ? `${displayText.trim()}\n\n${summary}`
                  : summary;

                set((s) => ({
                  messages: [
                    ...s.messages,
                    { role: "assistant" as const, content },
                  ],
                  isLoading: false,
                }));
                return;
              }
            }
          } catch {
            // retry failed, fall through
          }

          // Both attempts failed — show what went wrong
          set((s) => ({
            messages: [
              ...s.messages,
              {
                role: "assistant" as const,
                content: `I couldn't apply that edit. ${errorMsg}`,
              },
            ],
            isLoading: false,
          }));
          return;
        }

        // No code block — plain conversational response
        set((s) => ({
          messages: [
            ...s.messages,
            { role: "assistant" as const, content: responseText },
          ],
          isLoading: false,
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        set((s) => ({
          messages: s.messages, // keep messages as-is
          isLoading: false,
          error: message,
        }));
      }
    },

    setProvider(p: ProviderType) {
      set({ provider: p });
      saveSettings(p, get().apiKey);
    },

    setApiKey(key: string) {
      set({ apiKey: key });
      saveSettings(get().provider, key);
    },

    clearMessages() {
      set({ messages: [], error: null });
    },
  };
});

/** Strip JSON code blocks from AI response text, keeping everything else. */
function stripCodeBlock(text: string): string {
  return text.replace(/```json\s*\n[\s\S]*?```/g, "").replace(/```\s*\n\{[\s\S]*?\}\s*```/g, "").trim();
}

/** Build a human-readable summary of what was applied. */
function buildApplySummary(jsonText: string): string {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const parts: string[] = [];

    if (parsed.score && typeof parsed.score === "object") {
      const s = parsed.score as Record<string, unknown>;
      const fields = Object.keys(s).join(", ");
      parts.push(`Updated ${fields}`);
    }

    if (Array.isArray(parsed.patch) && parsed.patch.length > 0) {
      const measures = (parsed.patch as Record<string, unknown>[]).map(
        (e) => e.measure as number
      );
      const unique = [...new Set(measures)].sort((a, b) => a - b);
      parts.push(`Applied changes to measure${unique.length === 1 ? "" : "s"} ${unique.join(", ")}`);
    }

    if (Array.isArray(parsed.addParts) && parsed.addParts.length > 0) {
      const names = (parsed.addParts as Record<string, unknown>[]).map(
        (p) => (p.name as string) || "new part"
      );
      parts.push(`Added ${names.join(", ")} part${names.length === 1 ? "" : "s"}`);
    }

    if (parts.length === 0) return "\u2713 Changes applied";
    return "\u2713 " + parts.join("; ");
  } catch {
    return "\u2713 Changes applied";
  }
}
