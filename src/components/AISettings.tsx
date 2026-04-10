import { useState, useEffect, useCallback } from "react";
import { useChatStore, type ProviderType } from "../state/ChatState";
import { Input } from "./ui/input";
import { X } from "lucide-react";
import { fetchAnthropicModels } from "../ai/providers/anthropic";
import { fetchOpenAIModels } from "../ai/providers/openai";
import { fetchGeminiModels } from "../ai/providers/gemini";

interface ModelOption {
  id: string;
  name: string;
}

const modelCache: Partial<Record<ProviderType, ModelOption[]>> = {};

export function AISettings({ onClose }: { onClose?: () => void }) {
  const settings = useChatStore((s) => s.settings);
  const setProvider = useChatStore((s) => s.setProvider);
  const setApiKey = useChatStore((s) => s.setApiKey);
  const setModel = useChatStore((s) => s.setModel);

  const provider = settings.provider;
  const providerSettings = settings.providers[provider];
  const [models, setModels] = useState<ModelOption[]>(modelCache[provider] ?? []);
  const [loadingModels, setLoadingModels] = useState(false);

  const fetchModels = useCallback(async (p: ProviderType, key: string) => {
    if (!key) return;
    if (modelCache[p]) { setModels(modelCache[p]!); return; }
    setLoadingModels(true);
    try {
      const fetcher = p === "anthropic" ? fetchAnthropicModels
        : p === "openai" ? fetchOpenAIModels
        : fetchGeminiModels;
      const result = await fetcher(key);
      if (result.length > 0) {
        modelCache[p] = result;
        setModels(result);
      }
    } catch {
      // no models available
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    setModels(modelCache[provider] ?? []);
    fetchModels(provider, providerSettings.apiKey);
  }, [provider, providerSettings.apiKey, fetchModels]);

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
          <option value="gemini">Google Gemini</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>

      <label className="flex flex-col text-xs text-muted-foreground gap-1">
        API Key
        <Input
          type="password"
          className="h-7 text-xs font-mono"
          placeholder={provider === "anthropic" ? "sk-ant-..." : provider === "gemini" ? "AIza..." : "sk-..."}
          value={providerSettings.apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>

      <label className="flex flex-col text-xs text-muted-foreground gap-1">
        Model
        {models.length > 0 ? (
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={providerSettings.model}
            onChange={(e) => setModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <div className="h-7 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground flex items-center">
            {loadingModels ? "Loading models..." : providerSettings.apiKey ? "Enter a valid API key" : "Set API key to see models"}
          </div>
        )}
      </label>

    </div>
  );
}
