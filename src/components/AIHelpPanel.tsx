// src/components/AIHelpPanel.tsx
//
// AI SQL assistant panel — lets the user describe what they want in plain
// language and translates it into a SQL query using the server-side Claude API.
//
// The panel fetches column schemas on mount so it can send the full schema
// context to the AI endpoint.

import { useState, useEffect, useRef } from "react";
import { Sparkles, Copy, Play, Loader2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DbEngine, RemoteConnection, TableInfo, ColumnInfo } from "../types";
import { getSQLiteColumns } from "../engines/sqlite";
import { getDuckDBColumns } from "../engines/duckdb";
import { getRemoteColumns } from "../engines/remote";

interface Props {
  engine: DbEngine;
  tables: TableInfo[];
  remoteConnection: RemoteConnection | null;
  token: string | null;
  onUseQuery: (sql: string) => void;
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

export function AIHelpPanel({ engine, tables, remoteConnection, token, onUseQuery }: Props) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [schema, setSchema] = useState<TableSchema[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        <span className="text-xs font-medium text-[var(--ide-text)]">{t('ai.title')}</span>
        {tables.length > 0 && (
          <span className="ml-auto text-[10px] text-[var(--ide-text-4)]">
            {t('ai.context', { count: tables.length })}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-3 flex-1 overflow-y-auto">
        {/* Prompt input */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="ai-prompt"
            className="text-xs text-[var(--ide-text-3)]"
          >
            {t('ai.label')}
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
            placeholder={t('ai.placeholder')}
            className="w-full resize-none rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg)] px-3 py-2 text-xs text-[var(--ide-text)] placeholder:text-[var(--ide-text-4)] focus:outline-none focus:border-purple-500 transition-colors"
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            aria-label={t('ai.generate')}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-xs font-medium text-white transition-colors"
          >
            {isLoading ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={12} aria-hidden="true" />
            )}
            {isLoading ? t('ai.generating') : t('ai.generate')}
            {!isLoading && (
              <span className="opacity-60 ml-0.5" aria-hidden="true">⌘↵</span>
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
            {error}
          </div>
        )}

        {/* Generated SQL result */}
        {generatedSQL && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--ide-text-3)]">{t('ai.generatedSQL')}</span>
            <pre
              className="rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg)] p-2.5 text-xs text-[var(--ide-text)] overflow-x-auto whitespace-pre-wrap font-mono"
            >
              {generatedSQL}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => onUseQuery(generatedSQL)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-medium text-white transition-colors"
                aria-label={t('ai.useQuery')}
              >
                <Play size={11} fill="currentColor" aria-hidden="true" />
                {t('ai.useQuery')}
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ide-surface2)] hover:bg-[var(--ide-surface3)] border border-[var(--ide-border)] rounded-lg text-xs transition-colors"
                aria-label={t('ai.copy')}
              >
                <Copy size={11} aria-hidden="true" />
                {copied ? t('ai.copied') : t('ai.copy')}
              </button>
            </div>
          </div>
        )}

        {/* Empty state — no tables loaded yet */}
        {tables.length === 0 && (
          <p className="text-xs text-[var(--ide-text-4)] text-center mt-4">
            {t('ai.noTables')}
          </p>
        )}
      </div>
    </div>
  );
}
