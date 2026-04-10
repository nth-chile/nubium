/**
 * Provider-specific tool format translations.
 * All providers accept our common ToolDefinition format and need it
 * translated to their native API format.
 */

import type { ToolDefinition, ToolParameterProperty } from "../ChatProvider";

// --- Anthropic format ---

export function toAnthropicTools(defs: ToolDefinition[]): Record<string, unknown>[] {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.inputSchema,
  }));
}

// --- OpenAI format ---

export function toOpenAITools(defs: ToolDefinition[]): Record<string, unknown>[] {
  return defs.map((d) => ({
    type: "function",
    function: {
      name: d.name,
      description: d.description,
      parameters: d.inputSchema,
    },
  }));
}

// --- Gemini format ---

function convertTypeForGemini(type: string): string {
  return type.toUpperCase();
}

function convertPropertyForGemini(prop: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: convertTypeForGemini((prop.type as string) || "string"),
  };
  if (prop.description) result.description = prop.description;
  if (prop.enum) result.enum = prop.enum;
  if (prop.items) {
    result.items = convertPropertyForGemini(prop.items as Record<string, unknown>);
  }
  if (prop.properties) {
    const props = prop.properties as Record<string, ToolParameterProperty>;
    const converted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(props)) {
      converted[key] = convertPropertyForGemini(val as unknown as Record<string, unknown>);
    }
    result.properties = converted;
  }
  if (prop.required) result.required = prop.required;
  return result;
}

export function toGeminiTools(defs: ToolDefinition[]): Record<string, unknown>[] {
  return [{
    functionDeclarations: defs.map((d) => {
      const properties: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(d.inputSchema.properties)) {
        properties[key] = convertPropertyForGemini(val as unknown as Record<string, unknown>);
      }
      return {
        name: d.name,
        description: d.description,
        parameters: {
          type: "OBJECT",
          properties,
          required: d.inputSchema.required ?? [],
        },
      };
    }),
  }];
}
