import { useChatStore } from "../state/ChatState";
import type { ProviderType } from "../state/ChatState";
import { Input } from "./ui/input";
import { X } from "lucide-react";

export function AISettings({ onClose }: { onClose?: () => void }) {
  const provider = useChatStore((s) => s.provider);
  const apiKey = useChatStore((s) => s.apiKey);
  const setProvider = useChatStore((s) => s.setProvider);
  const setApiKey = useChatStore((s) => s.setApiKey);

  return (
    <div className="p-2 border-b flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          AI Settings
        </div>
        {onClose && (
          <button onClick={onClose} className="p-0.5 rounded-sm hover:bg-accent cursor-pointer" title="Close settings">
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <label className="flex flex-col text-xs text-muted-foreground gap-1">
        Provider
        <select
          className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          value={provider}
          onChange={(e) => setProvider(e.target.value as ProviderType)}
        >
          <option value="gemini">Google Gemini (Free)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT-4o)</option>
        </select>
      </label>

      <label className="flex flex-col text-xs text-muted-foreground gap-1">
        API Key
        <Input
          type="password"
          className="h-7 text-xs font-mono"
          placeholder={provider === "anthropic" ? "sk-ant-..." : provider === "gemini" ? "AIza..." : "sk-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>

      <div className="text-[11px] text-muted-foreground">
        {provider === "gemini"
          ? "Uses Gemini 2.5 Flash. Free tier — get key at aistudio.google.com"
          : provider === "anthropic"
            ? "Uses Claude Sonnet via the Messages API."
            : "Uses GPT-4o (~$2.50/M input, $10/M output)."}
      </div>
    </div>
  );
}
