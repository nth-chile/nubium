import type { ChatMessage, ChatProvider, ChatProviderConfig, ToolDefinition, ProviderResponse, MessageContent } from "../ChatProvider";
import { getMessageText } from "../ChatProvider";
import { toAnthropicTools } from "../tools/ToolSchema";

export class AnthropicProvider implements ChatProvider {
  id = "anthropic";
  name = "Anthropic (Claude)";

  async sendMessage(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ChatProviderConfig,
  ): Promise<ProviderResponse> {
    const apiKey = config.providerOptions?.apiKey as string;
    if (!apiKey) throw new Error("Anthropic API key is not set");

    // Separate system messages
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const systemPrompt = systemMessages.length > 0
      ? systemMessages.map((m) => getMessageText(m)).join("\n\n")
      : undefined;

    // Convert messages to Anthropic format
    const anthropicMessages = conversationMessages.map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role, content: m.content };
      }
      // Convert MessageContent[] to Anthropic content blocks
      const blocks = m.content.map((c) => {
        switch (c.type) {
          case "text":
            return { type: "text", text: c.text };
          case "tool_use":
            return { type: "tool_use", id: c.id, name: c.name, input: c.input };
          case "tool_result":
            return { type: "tool_result", tool_use_id: c.tool_use_id, content: c.content, is_error: c.is_error };
          default:
            return { type: "text", text: "" };
        }
      });
      return { role: m.role, content: blocks };
    });

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      messages: anthropicMessages,
    };

    if (systemPrompt) body.system = systemPrompt;
    if (tools.length > 0) body.tools = toAnthropicTools(tools);
    if (config.temperature !== undefined) body.temperature = config.temperature;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason: string;
    };

    // Convert response to common format
    const content: MessageContent[] = data.content
      .filter((b) => b.type === "text" || b.type === "tool_use")
      .map((b) => {
        if (b.type === "tool_use") {
          return { type: "tool_use" as const, id: b.id!, name: b.name!, input: b.input! };
        }
        return { type: "text" as const, text: b.text ?? "" };
      });

    return {
      stopReason: data.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      content,
    };
  }
}

/** Fetch available models from the Anthropic API */
export async function fetchAnthropicModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    if (!response.ok) return [];
    const data = await response.json() as { data: Array<{ id: string; display_name?: string }> };
    return (data.data ?? [])
      .filter((m) => m.id.includes("claude"))
      .map((m) => ({ id: m.id, name: m.display_name ?? m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
