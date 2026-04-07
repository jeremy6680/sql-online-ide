/**
 * ApiKeySettings modal — lets authenticated users add/remove their
 * OpenAI and Anthropic API keys.
 *
 * Keys are sent over HTTPS to the server and stored encrypted (AES-256-GCM).
 * The frontend never sees the raw key after it has been saved — only a
 * boolean indicating whether one is stored.
 */
import { useState, useEffect } from "react";
import { X, KeyRound, Trash2, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
import type { AiProvider } from "../store";

interface Props {
  token: string;
  onClose: () => void;
  onKeysChanged: (presence: { anthropic: boolean; openai: boolean }) => void;
}

interface ProviderConfig {
  id: AiProvider;
  label: string;
  placeholder: string;
  hint: string;
  docsUrl: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    placeholder: "sk-ant-api03-…",
    hint: "Starts with sk-ant-",
    docsUrl: "https://console.anthropic.com/",
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    placeholder: "sk-proj-…",
    hint: "Starts with sk-",
    docsUrl: "https://platform.openai.com/api-keys",
  },
];

export function ApiKeySettings({ token, onClose, onKeysChanged }: Props) {
  const [presence, setPresence] = useState<{ anthropic: boolean; openai: boolean }>({
    anthropic: false,
    openai: false,
  });
  const [inputs, setInputs] = useState<Record<AiProvider, string>>({ anthropic: "", openai: "" });
  const [visible, setVisible] = useState<Record<AiProvider, boolean>>({ anthropic: false, openai: false });
  const [saving, setSaving] = useState<Record<AiProvider, boolean>>({ anthropic: false, openai: false });
  const [deleting, setDeleting] = useState<Record<AiProvider, boolean>>({ anthropic: false, openai: false });
  const [messages, setMessages] = useState<Record<AiProvider, { type: "ok" | "error"; text: string } | null>>({
    anthropic: null,
    openai: null,
  });

  useEffect(() => {
    fetch("/api/user/api-keys", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { anthropic: boolean; openai: boolean }) => {
        setPresence(data);
      })
      .catch(() => {});
  }, [token]);

  function setMsg(provider: AiProvider, msg: { type: "ok" | "error"; text: string } | null) {
    setMessages((prev) => ({ ...prev, [provider]: msg }));
    if (msg?.type === "ok") {
      setTimeout(() => setMessages((prev) => ({ ...prev, [provider]: null })), 3000);
    }
  }

  async function handleSave(provider: AiProvider) {
    const key = inputs[provider].trim();
    if (!key) return;

    setSaving((prev) => ({ ...prev, [provider]: true }));
    setMsg(provider, null);

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider, key }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(provider, { type: "error", text: data.error ?? "Failed to save key." });
        return;
      }
      const next = { ...presence, [provider]: true };
      setPresence(next);
      onKeysChanged(next);
      setInputs((prev) => ({ ...prev, [provider]: "" }));
      setMsg(provider, { type: "ok", text: "Key saved and encrypted successfully." });
    } catch {
      setMsg(provider, { type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving((prev) => ({ ...prev, [provider]: false }));
    }
  }

  async function handleDelete(provider: AiProvider) {
    setDeleting((prev) => ({ ...prev, [provider]: true }));
    setMsg(provider, null);
    try {
      const res = await fetch(`/api/user/api-keys/${provider}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(provider, { type: "error", text: data.error ?? "Failed to delete key." });
        return;
      }
      const next = { ...presence, [provider]: false };
      setPresence(next);
      onKeysChanged(next);
      setMsg(provider, { type: "ok", text: "Key removed." });
    } catch {
      setMsg(provider, { type: "error", text: "Network error. Please try again." });
    } finally {
      setDeleting((prev) => ({ ...prev, [provider]: false }));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="API Key Settings"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--ide-border)] shadow-2xl"
        style={{ background: "var(--ide-surface)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--ide-border)]">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-[var(--ide-text-2)]" />
            <h2 className="font-semibold text-sm text-[var(--ide-text)]">API Keys</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-6">
          {/* Security note */}
          <p className="text-xs text-[var(--ide-text-3)] bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 leading-relaxed">
            Your keys are encrypted with AES-256-GCM before being stored. They are never sent back to your browser — only the server uses them when calling AI providers.
          </p>

          {PROVIDERS.map((prov) => (
            <div key={prov.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--ide-text)]">{prov.label}</span>
                  {presence[prov.id] && (
                    <span className="flex items-center gap-1 text-[11px] text-green-400">
                      <CheckCircle2 size={11} />
                      Stored
                    </span>
                  )}
                </div>
                {presence[prov.id] && (
                  <button
                    onClick={() => handleDelete(prov.id)}
                    disabled={deleting[prov.id]}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                    aria-label={`Remove ${prov.label} key`}
                  >
                    {deleting[prov.id] ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Trash2 size={11} />
                    )}
                    Remove
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={visible[prov.id] ? "text" : "password"}
                    value={inputs[prov.id]}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [prov.id]: e.target.value }))}
                    placeholder={presence[prov.id] ? "Enter new key to replace…" : prov.placeholder}
                    className="w-full bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 pr-8 py-2 text-xs text-[var(--ide-text)] placeholder:text-[var(--ide-text-4)] focus:outline-none focus:border-blue-500 transition-colors font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((prev) => ({ ...prev, [prov.id]: !prev[prov.id] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ide-text-4)] hover:text-[var(--ide-text-2)] transition-colors"
                    aria-label={visible[prov.id] ? "Hide key" : "Show key"}
                    tabIndex={-1}
                  >
                    {visible[prov.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <button
                  onClick={() => handleSave(prov.id)}
                  disabled={saving[prov.id] || !inputs[prov.id].trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg text-xs font-medium text-white transition-colors"
                >
                  {saving[prov.id] ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                </button>
              </div>

              <span className="text-[11px] text-[var(--ide-text-4)]">{prov.hint}</span>

              {messages[prov.id] && (
                <div
                  role="alert"
                  className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 ${
                    messages[prov.id]!.type === "ok"
                      ? "text-green-400 bg-green-500/10 border border-green-500/20"
                      : "text-red-400 bg-red-500/10 border border-red-500/20"
                  }`}
                >
                  {messages[prov.id]!.type === "ok" ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <AlertCircle size={12} />
                  )}
                  {messages[prov.id]!.text}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
