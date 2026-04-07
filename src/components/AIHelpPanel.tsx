// src/components/AIHelpPanel.tsx
//
// AI SQL assistant panel — lets the user describe what they want in plain
// language and translates it into a SQL query using the server-side AI API.
//
// Supports Anthropic (Claude) and OpenAI (GPT) providers.
// The active provider and model are stored in Zustand and persisted.

import { useState, useEffect, useRef } from "react";
import { Sparkles, Copy, Play, Loader2, AlertCircle, KeyRound, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DbEngine, RemoteConnection, TableInfo, ColumnInfo } from "../types";
import { getSQLiteColumns } from "../engines/sqlite";
import { getDuckDBColumns } from "../engines/duckdb";
import { getRemoteColumns } from "../engines/remote";
import {
  useStore,
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  type AiProvider,
} from "../store";

interface Props {
  engine: DbEngine;
  tables: TableInfo[];
  remoteConnection: RemoteConnection | null;
  token: string | null;
  onUseQuery: (sql: string) => void;
  onOpenApiKeySettings: () => void;
}

interface TableSchema {
  name: string;
  columns: ColumnInfo[];
}

async function fetchSchema(
  engine: DbEngine,
  tables: TableInfo[],
  remoteConnection: RemoteConnection | null,
): Promise<TableSchema[]> {
  return Promise.all(
    tables.map(async (t) => {
      let columns: ColumnInfo[] = [];
      try {
        if (engine === "sqlite") {
          columns = getSQLiteColumns(t.name);
        } else if (engine === "duckdb") {
          columns = await getDuckDBColumns(t.name);
        } else if (remoteConnection) {
          columns = await getRemoteColumns(engine, remoteConnection, t.name);
        }
      } catch {
        // If schema fetch fails for a table, continue with empty columns
      }
      return { name: t.name, columns };
    }),
  );
}

export function AIHelpPanel({
  engine,
  tables,
  remoteConnection,
  token,
  onUseQuery,
  onOpenApiKeySettings,
}: Props) {
  const { t } = useTranslation();
  const { aiProvider, setAiProvider, aiModel, setAiModel, aiKeyPresence } = useStore();

  const [prompt, setPrompt] = useState("");
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [schema, setSchema] = useState<TableSchema[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const models = aiProvider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;
  const hasKey = aiKeyPresence[aiProvider];

  // When switching provider, reset model to that provider's default
  function handleProviderChange(p: AiProvider) {
    setAiProvider(p);
    if (p === "openai") {
      setAiModel(OPENAI_MODELS[0].id);
    } else {
      setAiModel(ANTHROPIC_MODELS[0].id);
    }
    setGeneratedSQL("");
    setError(null);
  }

  // Load schema when tables change
  useEffect(() => {
    if (tables.length === 0) {
      setSchema([]);
      return;
    }
    fetchSchema(engine, tables, remoteConnection).then(setSchema).catch(() => setSchema([]));
  }, [engine, tables, remoteConnection]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setGeneratedSQL("");

    try {
      const res = await fetch("/api/ai/sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          engine,
          provider: aiProvider,
          model: aiModel,
          tables: schema.map((t) => ({
            name: t.name,
            columns: t.columns.map((c) => ({ name: c.name, type: c.type })),
          })),
        }),
      });

      const data = (await res.json()) as { sql?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Unknown error");
      } else {
        setGeneratedSQL(data.sql ?? "");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedSQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-[var(--ide-border)] shrink-0"
        style={{ background: "var(--ide-surface)" }}
      >
        <Sparkles size={13} className="text-purple-400" aria-hidden="true" />
        <span className="text-xs font-medium text-[var(--ide-text)]">{t("ai.title")}</span>
        {tables.length > 0 && (
          <span className="ml-auto text-[10px] text-[var(--ide-text-4)]">
            {t("ai.context", { count: tables.length })}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-3 flex-1 overflow-y-auto">
        {/* Provider + Model selector */}
        <div className="flex gap-2">
          {/* Provider */}
          <div className="relative flex-1">
            <select
              value={aiProvider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
              className="w-full appearance-none bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-2 pr-6 py-1.5 text-xs text-[var(--ide-text)] focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
              aria-label="AI provider"
            >
              <option value="anthropic">Claude (Anthropic)</option>
              <option value="openai">GPT (OpenAI)</option>
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ide-text-4)] pointer-events-none" />
          </div>

          {/* Model */}
          <div className="relative flex-1">
            <select
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              className="w-full appearance-none bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-2 pr-6 py-1.5 text-xs text-[var(--ide-text)] focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
              aria-label="AI model"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ide-text-4)] pointer-events-none" />
          </div>
        </div>

        {/* No key warning */}
        {!hasKey && (
          <button
            onClick={onOpenApiKeySettings}
            className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors text-left"
          >
            <KeyRound size={12} className="shrink-0" />
            <span>
              No {aiProvider === "openai" ? "OpenAI" : "Anthropic"} key configured.{" "}
              <span className="underline">Add your API key →</span>
            </span>
          </button>
        )}

        {/* Prompt input */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ai-prompt" className="text-xs text-[var(--ide-text-3)]">
            {t("ai.label")}
          </label>
          <textarea
            id="ai-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
            }}
            rows={4}
            placeholder={t("ai.placeholder")}
            className="w-full resize-none rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg)] px-3 py-2 text-xs text-[var(--ide-text)] placeholder:text-[var(--ide-text-4)] focus:outline-none focus:border-purple-500 transition-colors"
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            aria-label={t("ai.generate")}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-xs font-medium text-white transition-colors"
          >
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={12} aria-hidden="true" />
            )}
            {isLoading ? t("ai.generating") : t("ai.generate")}
            {!isLoading && (
              <span className="opacity-60 ml-0.5" aria-hidden="true">
                ⌘↵
              </span>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400"
          >
            <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {error}
              {error.includes("API key") && (
                <button
                  onClick={onOpenApiKeySettings}
                  className="ml-1 underline hover:no-underline"
                >
                  Configure keys →
                </button>
              )}
            </span>
          </div>
        )}

        {/* Generated SQL result */}
        {generatedSQL && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--ide-text-3)]">{t("ai.generatedSQL")}</span>
            <pre className="rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg)] p-2.5 text-xs text-[var(--ide-text)] overflow-x-auto whitespace-pre-wrap font-mono">
              {generatedSQL}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => onUseQuery(generatedSQL)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-medium text-white transition-colors"
                aria-label={t("ai.useQuery")}
              >
                <Play size={11} fill="currentColor" aria-hidden="true" />
                {t("ai.useQuery")}
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-xs transition-colors"
                aria-label={t("ai.copy")}
              >
                <Copy size={11} aria-hidden="true" />
                {copied ? t("ai.copied") : t("ai.copy")}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {tables.length === 0 && (
          <p className="text-xs text-[var(--ide-text-4)] text-center mt-4">
            {t("ai.noTables")}
          </p>
        )}
      </div>
    </div>
  );
}
