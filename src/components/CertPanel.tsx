// src/components/CertPanel.tsx — ENI SQL Certification Prep panel

import { useState, useRef, useEffect } from "react";
import {
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  BookOpen,
  Loader2,
  Trophy,
  Copy,
  Check,
} from "lucide-react";
import type {
  CertPart,
  CertQuestion,
  CertQuestionPractical,
  CertQuestionQCM,
  CertQuestionQCU,
  CertQuestionType,
} from "../types";
import { runSQLiteIsolated } from "../engines/sqlite";

interface Props {
  token: string | null;
  onClose: () => void;
}

const PART_LABELS: Record<CertPart, string> = {
  1: "Partie 1 – Requêtes simples",
  2: "Partie 2 – Requêtes complexes",
  3: "Partie 3 – Mise à jour des données",
  4: "Partie 4 – Vues",
};

const TYPE_LABELS: Record<CertQuestionType, string> = {
  qcu: "QCU (choix unique)",
  qcm: "QCM (choix multiple)",
  practical: "Cas pratique",
};

type PanelState = "setup" | "loading" | "question" | "feedback";

function normalizeRows(rows: unknown[][]): string[][] {
  return rows
    .map((row) =>
      row.map((v) => (v === null || v === undefined ? "NULL" : String(v))),
    )
    .sort((a, b) => a.join("\t").localeCompare(b.join("\t")));
}

function resultsMatch(
  userCols: string[],
  userRows: unknown[][],
  expectedCols: string[],
  expectedRows: unknown[][],
): boolean {
  if (userCols.length !== expectedCols.length) return false;
  const uSorted = [...userCols].sort();
  const eSorted = [...expectedCols].sort();
  if (uSorted.some((c, i) => c.toLowerCase() !== eSorted[i].toLowerCase()))
    return false;
  if (userRows.length !== expectedRows.length) return false;
  const uNorm = normalizeRows(userRows);
  const eNorm = normalizeRows(expectedRows);
  return uNorm.every((row, i) => row.every((v, j) => v === eNorm[i][j]));
}

// ── SchemaBlock ─────────────────────────────────────────────────────────────

function SchemaBlock({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="border border-[var(--ide-border)] rounded-lg overflow-hidden text-xs">
      <div className="flex items-center bg-[var(--ide-surface2)]">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center justify-between px-3 py-2 hover:bg-[var(--ide-surface3)] transition-colors text-left"
        >
          <span className="font-medium text-[var(--ide-text-2)]">
            Schéma de données
          </span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {/* Copy button — pastes schema SQL into clipboard so user can run it in the main editor */}
        <button
          onClick={handleCopy}
          title="Copier le SQL du schéma pour le coller dans l'éditeur"
          aria-label="Copier le SQL du schéma"
          className="px-2.5 py-2 hover:bg-[var(--ide-surface3)] transition-colors text-[var(--ide-text-3)] hover:text-[var(--ide-text)] border-l border-[var(--ide-border)]"
        >
          {copied ? (
            <Check size={12} className="text-emerald-500" />
          ) : (
            <Copy size={12} />
          )}
        </button>
      </div>
      {open && (
        <pre className="p-3 overflow-x-auto text-[var(--ide-text-2)] bg-[var(--ide-bg)] leading-relaxed whitespace-pre-wrap break-words">
          {sql}
        </pre>
      )}
    </div>
  );
}

// ── ChoiceButton ─────────────────────────────────────────────────────────────

function ChoiceButton({
  label,
  text,
  selected,
  correct,
  revealed,
  multi,
  onClick,
}: {
  label: string;
  text: string;
  selected: boolean;
  correct: boolean;
  revealed: boolean;
  multi: boolean;
  onClick: () => void;
}) {
  let bg: string;
  if (revealed) {
    if (correct)
      bg =
        "dark:bg-green-600/20 bg-green-100 dark:border-green-500 border-green-500 dark:text-green-300 text-green-700";
    else if (selected)
      bg =
        "dark:bg-red-600/20 bg-red-100 dark:border-red-500 border-red-500 dark:text-red-300 text-red-700";
    else
      bg = "bg-[var(--ide-surface2)] border-[var(--ide-border)] opacity-50";
  } else if (selected) {
    bg =
      "dark:bg-blue-600/20 bg-blue-100 dark:border-blue-500 border-blue-500 dark:text-blue-200 text-blue-700";
  } else {
    bg =
      "bg-[var(--ide-surface2)] border-[var(--ide-border)] hover:bg-[var(--ide-surface3)]";
  }

  // Detect SQL-like content to use monospace formatting
  const sqlKeywords = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "AVG(", "COUNT(", "SUM(", "WHERE", "FROM"];
  const isCode =
    text.includes("\n") ||
    sqlKeywords.some((kw) => text.trim().toUpperCase().startsWith(kw));

  return (
    <button
      onClick={onClick}
      disabled={revealed}
      className={`w-full text-left flex gap-3 px-3 py-2.5 border rounded-lg transition-colors text-xs disabled:cursor-default ${bg}`}
    >
      {/* Radio (QCU) or checkbox (QCM) indicator */}
      <span
        className={`shrink-0 w-5 h-5 flex items-center justify-center border border-current font-bold ${multi ? "rounded" : "rounded-full"}`}
      >
        {multi ? (
          <span
            className={`w-2.5 h-2.5 rounded-sm ${selected ? "bg-current" : ""}`}
          />
        ) : (
          label
        )}
      </span>
      <span className="flex-1">
        {isCode ? (
          <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed">
            {text}
          </pre>
        ) : (
          text
        )}
      </span>
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function CertPanel({ token, onClose }: Props) {
  const [panelState, setPanelState] = useState<PanelState>("setup");
  const [selectedPart, setSelectedPart] = useState<CertPart | "random">(
    "random",
  );
  const [selectedType, setSelectedType] = useState<CertQuestionType | "random">(
    "random",
  );
  const [question, setQuestion] = useState<CertQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  // QCU/QCM selection
  const [selectedChoices, setSelectedChoices] = useState<Set<string>>(
    new Set(),
  );

  // Practical case
  const [userSQL, setUserSQL] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Feedback
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedbackDetail, setFeedbackDetail] = useState<string | null>(null);
  const [showCorrectSQL, setShowCorrectSQL] = useState(false);

  // Session score
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    if (panelState === "question" && question?.type === "practical") {
      textareaRef.current?.focus();
    }
  }, [panelState, question]);

  async function handleGenerate() {
    setError(null);
    setQuestion(null);
    setSelectedChoices(new Set());
    setUserSQL("");
    setShowCorrectSQL(false);
    setFeedbackDetail(null);
    setPanelState("loading");

    const body: Record<string, unknown> = {};
    if (selectedPart !== "random") body.part = selectedPart;
    if (selectedType !== "random") body.type = selectedType;

    try {
      const res = await fetch("/api/cert/question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        question?: CertQuestion;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? "Erreur serveur");
      setQuestion(data.question!);
      setPanelState("question");
    } catch (err) {
      setError(String(err));
      setPanelState("setup");
    }
  }

  function toggleChoice(label: string, type: CertQuestionType) {
    setSelectedChoices((prev) => {
      const next = new Set(prev);
      if (type === "qcu") {
        next.clear();
        next.add(label);
      } else {
        if (next.has(label)) next.delete(label);
        else next.add(label);
      }
      return next;
    });
  }

  function handleSubmitChoices() {
    if (!question || (question.type !== "qcu" && question.type !== "qcm"))
      return;
    const q = question as CertQuestionQCU | CertQuestionQCM;
    const correct =
      selectedChoices.size === q.correctAnswers.length &&
      q.correctAnswers.every((a) => selectedChoices.has(a));
    setIsCorrect(correct);
    setScore((s) => ({
      correct: s.correct + (correct ? 1 : 0),
      total: s.total + 1,
    }));
    setPanelState("feedback");
  }

  async function handleSubmitPractical() {
    if (!question || question.type !== "practical") return;
    const q = question as CertQuestionPractical;
    if (!userSQL.trim()) return;

    setIsRunning(true);
    setFeedbackDetail(null);

    try {
      const [expected, actual] = await Promise.all([
        runSQLiteIsolated(q.schemaSQL, q.correctSQL),
        runSQLiteIsolated(q.schemaSQL, userSQL),
      ]);

      if (actual.error) {
        setIsCorrect(false);
        setFeedbackDetail(`Erreur SQL : ${actual.error}`);
        setScore((s) => ({ ...s, total: s.total + 1 }));
        setPanelState("feedback");
        return;
      }

      const match = resultsMatch(
        actual.columns,
        actual.rows,
        expected.columns,
        expected.rows,
      );
      setIsCorrect(match);
      setScore((s) => ({
        correct: s.correct + (match ? 1 : 0),
        total: s.total + 1,
      }));

      if (!match) {
        const lines: string[] = [];
        if (actual.rowCount !== expected.rowCount)
          lines.push(
            `Lignes obtenues : ${actual.rowCount} · Attendu : ${expected.rowCount}`,
          );
        const missing = expected.columns.filter(
          (c) =>
            !actual.columns
              .map((x) => x.toLowerCase())
              .includes(c.toLowerCase()),
        );
        if (missing.length)
          lines.push(`Colonnes manquantes : ${missing.join(", ")}`);
        setFeedbackDetail(
          lines.join("\n") ||
            "Le résultat ne correspond pas au résultat attendu.",
        );
      }
    } finally {
      setIsRunning(false);
      setPanelState("feedback");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden text-[var(--ide-text)]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--ide-border)] shrink-0"
        style={{ background: "var(--ide-surface)" }}
      >
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-emerald-500" aria-hidden="true" />
          <span className="text-sm font-semibold">Préparation ENI SQL</span>
        </div>
        <div className="flex items-center gap-2">
          {score.total > 0 && (
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--ide-surface2)] border border-[var(--ide-border)]"
              title="Score de la session"
            >
              <Trophy size={10} className="text-yellow-500" />
              <span className="font-medium">
                {score.correct}/{score.total}
              </span>
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Fermer le panneau de certification"
            className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)] p-1 rounded hover:bg-[var(--ide-surface2)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* ── Setup ──────────────────────────────────────────────────────── */}
        {panelState === "setup" && (
          <>
            <p className="text-xs text-[var(--ide-text-3)] leading-relaxed">
              L'IA génère une question originale dans l'esprit de l'examen ENI
              SQL. Choisissez une partie et un type, ou laissez sur Aléatoire.
            </p>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-2">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--ide-text-2)]">
                Partie
              </label>
              <select
                value={selectedPart}
                onChange={(e) =>
                  setSelectedPart(
                    e.target.value === "random"
                      ? "random"
                      : (Number(e.target.value) as CertPart),
                  )
                }
                className="text-xs px-2 py-1.5 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-surface2)] text-[var(--ide-text)] focus:outline-none focus:border-emerald-500"
              >
                <option value="random">Aléatoire</option>
                {([1, 2, 3, 4] as CertPart[]).map((p) => (
                  <option key={p} value={p}>
                    {PART_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--ide-text-2)]">
                Type de question
              </label>
              <select
                value={selectedType}
                onChange={(e) =>
                  setSelectedType(
                    e.target.value === "random"
                      ? "random"
                      : (e.target.value as CertQuestionType),
                  )
                }
                className="text-xs px-2 py-1.5 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-surface2)] text-[var(--ide-text)] focus:outline-none focus:border-emerald-500"
              >
                <option value="random">Aléatoire</option>
                {(["qcu", "qcm", "practical"] as CertQuestionType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={13} />
              Générer une question
            </button>
          </>
        )}

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {panelState === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-[var(--ide-text-3)]">
            <Loader2
              size={22}
              className="animate-spin text-emerald-500"
            />
            <p className="text-xs">Génération de la question…</p>
          </div>
        )}

        {/* ── Question ────────────────────────────────────────────────────── */}
        {panelState === "question" && question && (
          <>
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full dark:bg-emerald-600/20 bg-emerald-100 dark:text-emerald-300 text-emerald-700 dark:border-emerald-600/40 border-emerald-400 border font-medium">
                {PART_LABELS[question.part]}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--ide-surface2)] text-[var(--ide-text-2)] border border-[var(--ide-border)]">
                {TYPE_LABELS[question.type]}
              </span>
            </div>

            {/* Scenario context */}
            {question.context && (
              <p className="text-xs text-[var(--ide-text-2)] leading-relaxed bg-[var(--ide-surface2)] rounded-lg px-3 py-2 border border-[var(--ide-border)] italic">
                {question.context}
              </p>
            )}

            {/* Question text */}
            <p className="text-sm font-medium leading-relaxed text-[var(--ide-text)]">
              {question.questionText}
            </p>

            {/* QCU */}
            {question.type === "qcu" && (
              <div className="flex flex-col gap-2">
                {(question as CertQuestionQCU).choices.map((c) => (
                  <ChoiceButton
                    key={c.label}
                    label={c.label}
                    text={c.text}
                    selected={selectedChoices.has(c.label)}
                    correct={false}
                    revealed={false}
                    multi={false}
                    onClick={() => toggleChoice(c.label, "qcu")}
                  />
                ))}
                <button
                  onClick={handleSubmitChoices}
                  disabled={selectedChoices.size === 0}
                  className="mt-1 w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                >
                  Valider
                </button>
              </div>
            )}

            {/* QCM */}
            {question.type === "qcm" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--ide-text-3)]">
                  Plusieurs réponses possibles
                </p>
                {(question as CertQuestionQCM).choices.map((c) => (
                  <ChoiceButton
                    key={c.label}
                    label={c.label}
                    text={c.text}
                    selected={selectedChoices.has(c.label)}
                    correct={false}
                    revealed={false}
                    multi={true}
                    onClick={() => toggleChoice(c.label, "qcm")}
                  />
                ))}
                <button
                  onClick={handleSubmitChoices}
                  disabled={selectedChoices.size === 0}
                  className="mt-1 w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                >
                  Valider
                </button>
              </div>
            )}

            {/* Practical */}
            {question.type === "practical" && (
              <div className="flex flex-col gap-3">
                <SchemaBlock
                  sql={(question as CertQuestionPractical).schemaSQL}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--ide-text-2)]">
                    Votre requête SQL
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={userSQL}
                    onChange={(e) => setUserSQL(e.target.value)}
                    placeholder="Écrivez votre requête SQL ici…"
                    rows={8}
                    spellCheck={false}
                    className="w-full resize-y text-xs font-mono px-3 py-2 rounded-lg border border-[var(--ide-border)] bg-[var(--ide-bg)] text-[var(--ide-text)] focus:outline-none focus:border-emerald-500 leading-relaxed"
                  />
                </div>
                <button
                  onClick={handleSubmitPractical}
                  disabled={!userSQL.trim() || isRunning}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                >
                  {isRunning ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Vérification…
                    </>
                  ) : (
                    "Valider ma réponse"
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Feedback ────────────────────────────────────────────────────── */}
        {panelState === "feedback" && question && (
          <>
            {/* Result banner */}
            <div
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border font-semibold text-sm ${
                isCorrect
                  ? "dark:bg-green-600/15 bg-green-100 dark:border-green-500/50 border-green-400 dark:text-green-300 text-green-700"
                  : "dark:bg-red-600/15 bg-red-100 dark:border-red-500/50 border-red-400 dark:text-red-300 text-red-700"
              }`}
            >
              {isCorrect ? (
                <CheckCircle size={16} className="shrink-0" />
              ) : (
                <XCircle size={16} className="shrink-0" />
              )}
              {isCorrect ? "Bonne réponse !" : "Réponse incorrecte"}
            </div>

            {/* QCU/QCM revealed choices */}
            {(question.type === "qcu" || question.type === "qcm") && (
              <div className="flex flex-col gap-1.5">
                {(question as CertQuestionQCU | CertQuestionQCM).choices.map(
                  (c) => (
                    <ChoiceButton
                      key={c.label}
                      label={c.label}
                      text={c.text}
                      selected={selectedChoices.has(c.label)}
                      correct={(
                        question as CertQuestionQCU
                      ).correctAnswers.includes(c.label)}
                      revealed={true}
                      multi={question.type === "qcm"}
                      onClick={() => {}}
                    />
                  ),
                )}
              </div>
            )}

            {/* Practical: mismatch detail */}
            {question.type === "practical" && feedbackDetail && (
              <div className="text-xs bg-[var(--ide-surface2)] rounded-lg px-3 py-2 border border-[var(--ide-border)] text-[var(--ide-text-2)] whitespace-pre-line">
                {feedbackDetail}
              </div>
            )}

            {/* Explanation */}
            <div className="text-xs bg-[var(--ide-surface2)] rounded-lg px-3 py-2.5 border border-[var(--ide-border)] leading-relaxed text-[var(--ide-text-2)]">
              <p className="font-semibold text-[var(--ide-text)] mb-1">
                Explication
              </p>
              {question.explanation}
            </div>

            {/* Show correct SQL (practical only) */}
            {question.type === "practical" && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setShowCorrectSQL((v) => !v)}
                  className="flex items-center gap-1.5 text-xs dark:text-emerald-400 text-emerald-600 dark:hover:text-emerald-300 hover:text-emerald-700 transition-colors"
                >
                  {showCorrectSQL ? (
                    <ChevronUp size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  {showCorrectSQL ? "Masquer" : "Voir"} la solution
                </button>
                {showCorrectSQL && (
                  <pre className="text-xs font-mono bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed text-[var(--ide-text-2)]">
                    {(question as CertQuestionPractical).correctSQL}
                  </pre>
                )}
              </div>
            )}

            {/* Next question */}
            <button
              onClick={() => setPanelState("setup")}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={13} />
              Question suivante
            </button>
          </>
        )}
      </div>
    </div>
  );
}
