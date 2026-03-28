import { useChatStore } from "../state/ChatState";
import type { ProviderType } from "../state/ChatState";

export function AISettings() {
  const provider = useChatStore((s) => s.provider);
  const apiKey = useChatStore((s) => s.apiKey);
  const setProvider = useChatStore((s) => s.setProvider);
  const setApiKey = useChatStore((s) => s.setApiKey);

  return (
    <div style={styles.container}>
      <div style={styles.heading}>AI Settings</div>

      <label style={styles.label}>
        Provider
        <select
          style={styles.select}
          value={provider}
          onChange={(e) => setProvider(e.target.value as ProviderType)}
        >
          <option value="gemini">Google Gemini (Free)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT-4o)</option>
        </select>
      </label>

      <label style={styles.label}>
        API Key
        <input
          style={styles.input}
          type="password"
          placeholder={
            provider === "anthropic"
              ? "sk-ant-..."
              : provider === "gemini"
                ? "AIza..."
                : "sk-..."
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>

      <div style={styles.hint}>
        {provider === "gemini"
          ? "Uses Gemini 2.5 Flash. Free tier — get key at aistudio.google.com"
          : provider === "anthropic"
            ? "Uses Claude Sonnet via the Messages API."
            : "Uses GPT-4o (~$2.50/M input, $10/M output)."}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "8px 12px",
    borderBottom: "1px solid #333",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: 600,
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    fontSize: 12,
    color: "#ccc",
    gap: 4,
  },
  select: {
    background: "#2a2a2a",
    color: "#eee",
    border: "1px solid #444",
    borderRadius: 4,
    padding: "4px 6px",
    fontSize: 12,
  },
  input: {
    background: "#2a2a2a",
    color: "#eee",
    border: "1px solid #444",
    borderRadius: 4,
    padding: "4px 6px",
    fontSize: 12,
    fontFamily: "monospace",
  },
  hint: {
    fontSize: 11,
    color: "#777",
  },
};
