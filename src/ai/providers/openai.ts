import type { ChatMessage, ChatProvider, ChatProviderConfig, ToolDefinition, ProviderResponse, MessageContent } from "../ChatProvider";
import { getMessageText } from "../ChatProvider";
import { toOpenAITools } from "../tools/ToolSchema";

export class OpenAIProvider implements ChatProvider {
  id = "openai";
  name = "OpenAI";

  async sendMessage(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ChatProviderConfig,
  ): Promise<ProviderResponse> {
    const apiKey = config.providerOptions?.apiKey as string;
    if (!apiKey) throw new Error("OpenAI API key is not set");

    // Convert messages to OpenAI format
    const openaiMessages: Record<string, unknown>[] = [];

    for (const m of messages) {
      if (typeof m.content === "string") {
        openaiMessages.push({ role: m.role, content: m.content });
        continue;
      }

      // Check for tool results — OpenAI uses separate "tool" role messages
      const toolResults = m.content.filter((c) => c.type === "tool_result");
      if (toolResults.length > 0) {
        for (const c of toolResults) {
          if (c.type === "tool_result") {
            openaiMessages.push({ role: "tool", tool_call_id: c.tool_use_id, content: c.content });
          }
        }
        continue;
      }

      // Assistant message with tool calls
      const textParts = m.content.filter((c) => c.type === "text");
      const toolUses = m.content.filter((c) => c.type === "tool_use");

      const msg: Record<string, unknown> = {
        role: m.role,
        content: textParts.map((c) => c.type === "text" ? c.text : "").join("") || null,
      };

      if (toolUses.length > 0) {
        msg.tool_calls = toolUses
          .filter((c) => c.type === "tool_use")
          .map((c) => ({
            id: c.type === "tool_use" ? c.id : "",
            type: "function",
            function: { name: c.type === "tool_use" ? c.name : "", arguments: JSON.stringify(c.type === "tool_use" ? c.input : {}) },
          }));
      }

      openaiMessages.push(msg);
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: openaiMessages,
      max_tokens: config.maxTokens ?? 4096,
    };

    if (tools.length > 0) body.tools = toOpenAITools(tools);
    if (config.temperature !== undefined) body.temperature = config.temperature;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
    };

    const choice = data.choices?.[0];
    if (!choice) throw new Error("No response from OpenAI");

    const content: MessageContent[] = [];

    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
      content,
    };
  }
}

/** Fetch available models from the OpenAI API */
export async function fetchOpenAIModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return [];
    const data = await response.json() as { data: Array<{ id: string }> };
    return (data.data ?? [])
      .filter((m) => m.id.startsWith("gpt-") || m.id.startsWith("o"))
      .filter((m) => !m.id.includes("realtime") && !m.id.includes("audio") && !m.id.includes("tts") && !m.id.includes("dall-e") && !m.id.includes("whisper") && !m.id.includes("embedding"))
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
