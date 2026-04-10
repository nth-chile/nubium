import type { ChatMessage, ChatProvider, ChatProviderConfig, ToolDefinition, ProviderResponse, MessageContent } from "../ChatProvider";
import { getMessageText } from "../ChatProvider";
import { toGeminiTools } from "../tools/ToolSchema";

let toolCallCounter = 0;

export class GeminiProvider implements ChatProvider {
  id = "gemini";
  name = "Google Gemini (Free)";

  async sendMessage(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ChatProviderConfig,
  ): Promise<ProviderResponse> {
    const apiKey = config.providerOptions?.apiKey as string;
    if (!apiKey) throw new Error("Gemini API key is not set");

    // Separate system messages
    const systemParts = messages
      .filter((m) => m.role === "system")
      .map((m) => getMessageText(m))
      .join("\n\n");

    // Convert conversation messages to Gemini format
    const contents: Record<string, unknown>[] = [];

    for (const m of messages) {
      if (m.role === "system") continue;

      const geminiRole = m.role === "assistant" ? "model" : "user";

      if (typeof m.content === "string") {
        contents.push({ role: geminiRole, parts: [{ text: m.content }] });
        continue;
      }

      const parts: Record<string, unknown>[] = [];

      for (const c of m.content) {
        switch (c.type) {
          case "text":
            parts.push({ text: c.text });
            break;
          case "tool_use":
            parts.push({ functionCall: { name: c.name, args: c.input } });
            break;
          case "tool_result":
            // Gemini uses functionResponse matched by name
            // We stored the tool name in tool_use_id as "name:id"
            const name = c.tool_use_id.split(":")[0];
            let response: unknown;
            try { response = JSON.parse(c.content); } catch { response = { result: c.content }; }
            parts.push({ functionResponse: { name, response } });
            break;
        }
      }

      if (parts.length > 0) {
        contents.push({ role: geminiRole, parts });
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`;

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: config.maxTokens ?? 8192,
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      },
    };

    if (systemParts) {
      body.systemInstruction = { parts: [{ text: systemParts }] };
    }

    if (tools.length > 0) {
      body.tools = toGeminiTools(tools);
      body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: { name: string; args: Record<string, unknown> };
          }>;
        };
        finishReason?: string;
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const finishReason = data.candidates?.[0]?.finishReason;

    const content: MessageContent[] = [];
    let hasToolUse = false;

    for (const part of parts) {
      if (part.functionCall) {
        hasToolUse = true;
        // Gemini doesn't have tool call IDs — generate synthetic ones
        // Encode the tool name in the ID so we can match it in functionResponse
        const syntheticId = `${part.functionCall.name}:gemini_${++toolCallCounter}`;
        content.push({
          type: "tool_use",
          id: syntheticId,
          name: part.functionCall.name,
          input: part.functionCall.args,
        });
      } else if (part.text) {
        content.push({ type: "text", text: part.text });
      }
    }

    return {
      stopReason: hasToolUse || finishReason === "TOOL_CODE" ? "tool_use" : "end_turn",
      content,
    };
  }
}

/** Fetch available models from the Gemini API */
export async function fetchGeminiModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!response.ok) return [];
    const data = await response.json() as {
      models: Array<{ name: string; displayName: string; supportedGenerationMethods?: string[] }>;
    };
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({
        id: m.name.replace("models/", ""),
        name: m.displayName,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
