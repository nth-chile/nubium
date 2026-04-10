// --- Message content types ---

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type MessageContent = TextContent | ToolUseContent | ToolResultContent;

// --- Messages ---

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | MessageContent[];
}

/** Extract plain text from a message's content */
export function getMessageText(msg: ChatMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("");
}

/** Check if a message contains tool use blocks */
export function hasToolUse(msg: ChatMessage): boolean {
  if (typeof msg.content === "string") return false;
  return msg.content.some((c) => c.type === "tool_use");
}

/** Extract tool use blocks from a message */
export function getToolUses(msg: ChatMessage): ToolUseContent[] {
  if (typeof msg.content === "string") return [];
  return msg.content.filter((c): c is ToolUseContent => c.type === "tool_use");
}

// --- Provider response ---

export interface ProviderResponse {
  stopReason: "end_turn" | "tool_use";
  content: MessageContent[];
}

// --- Provider config ---

export interface ChatProviderConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  providerOptions?: Record<string, unknown>;
}

// --- Tool schema (inline, used by providers) ---

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

// --- Provider interface ---

export interface ChatProvider {
  id: string;
  name: string;
  sendMessage(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ChatProviderConfig,
  ): Promise<ProviderResponse>;
}
