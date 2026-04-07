// src/components/CertPanel.tsx — SQL Certification Test panel

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  ClipboardList,
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
  language: 'en' | 'fr';
  onClose: () => void;
}

// Cost estimate for exam generation (20 questions via claude-haiku-4-5)
const EXAM_COST = { usd: 0.06, eur: 0.055 };

type PanelState =
  | "setup"
  | "loading"
  | "question"
  | "feedback"
  | "exam-loading"
  | "exam-results";

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
  // Column count must match, but names are not compared — renaming a column
  // (e.g. "total" vs "montant_total") should not invalidate a correct answer
  if (userCols.length !== expectedCols.length) return false;
  if (userRows.length !== expectedRows.length) return false;
  const uNorm = normalizeRows(userRows);
  const eNorm = normalizeRows(expectedRows);
  return uNorm.every((row, i) => row.every((v, j) => v === eNorm[i][j]));
}

// ── SchemaBlock ─────────────────────────────────────────────────────────────

function SchemaBlock({ sql }: { sql: string }) {
  const { t } = useTranslation();
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
            {t('cert.schema.title')}
          </span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <button
          onClick={handleCopy}
          title={t('cert.schema.copyTitle')}
          aria-label={t('cert.schema.copyAriaLabel')}
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

  const sqlKeywords = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "AVG(", "COUNT(", "SUM(", "WHERE", "FROM", "WITH"];
  const isCode =
    text.includes("\n") ||
    sqlKeywords.some((kw) => text.trim().toUpperCase().startsWith(kw));

  return (
    <button
      onClick={onClick}
      disabled={revealed}
      className={`w-full text-left flex gap-3 px-3 py-2.5 border rounded-lg transition-colors text-xs disabled:cursor-default ${bg}`}
    >
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

// ── ExamResultsScreen ────────────────────────────────────────────────────────

function ExamResultsScreen({
  questions,
  answers,
  onRestart,
}: {
  questions: CertQuestion[];
  answers: boolean[];
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const total = answers.length;
  const correct = answers.filter(Boolean).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Per-part breakdown
  const partStats = ([1, 2, 3, 4] as CertPart[]).map((part) => {
    const qs = questions
      .map((q, i) => ({ q, ok: answers[i] }))
      .filter(({ q }) => q.part === part);
    const partCorrect = qs.filter(({ ok }) => ok).length;
    return { part, correct: partCorrect, total: qs.length };
  });

  const passed = pct >= 70;

  return (
    <div className="flex flex-col gap-4">
      {/* Score banner */}
      <div
        className={`flex flex-col items-center gap-1 px-4 py-5 rounded-xl border ${
          passed
            ? "dark:bg-green-600/10 bg-green-50 dark:border-green-500/40 border-green-300"
            : "dark:bg-red-600/10 bg-red-50 dark:border-red-500/40 border-red-300"
        }`}
      >
        <Trophy
          size={28}
          className={passed ? "text-yellow-500" : "text-[var(--ide-text-3)]"}
        />
        <p className="text-3xl font-bold mt-1">
          {correct}/{total}
        </p>
        <p
          className={`text-sm font-semibold ${passed ? "dark:text-green-300 text-green-700" : "dark:text-red-300 text-red-700"}`}
        >
          {pct}% — {passed ? t('cert.exam.passed') : t('cert.exam.needsImprovement')}
        </p>
      </div>

      {/* Per-part breakdown */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-[var(--ide-text-2)]">
          {t('cert.exam.breakdown')}
        </p>
        {partStats.map(({ part, correct: c, total: tot }) => {
          if (tot === 0) return null;
          const partPct = Math.round((c / tot) * 100);
          return (
            <div
              key={part}
              className="flex items-center gap-2 text-xs"
            >
              <span className="text-[var(--ide-text-3)] w-4 shrink-0">
                P{part}
              </span>
              <div className="flex-1 h-1.5 bg-[var(--ide-surface2)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${partPct >= 70 ? "bg-emerald-500" : "bg-red-400"}`}
                  style={{ width: `${partPct}%` }}
                />
              </div>
              <span className="text-[var(--ide-text-3)] w-10 text-right shrink-0">
                {c}/{tot}
              </span>
            </div>
          );
        })}
      </div>

      <button
        onClick={onRestart}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <RefreshCw size={13} />
        {t('cert.exam.backToHome')}
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function CertPanel({ token, language, onClose }: Props) {
  const { t } = useTranslation();
  const [panelState, setPanelState] = useState<PanelState>("setup");
  const [selectedPart, setSelectedPart] = useState<CertPart | "random">("random");
  const [selectedType, setSelectedType] = useState<CertQuestionType | "random">("random");
  const [question, setQuestion] = useState<CertQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  // QCU/QCM selection
  const [selectedChoices, setSelectedChoices] = useState<Set<string>>(new Set());

  // Practical case
  const [userSQL, setUserSQL] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Feedback
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedbackDetail, setFeedbackDetail] = useState<string | null>(null);
  const [showCorrectSQL, setShowCorrectSQL] = useState(false);

  // Session score (single mode)
  const [score, setScore] = useState({ correct: 0, total: 0 });

  // Exam mode
  const [isExamMode, setIsExamMode] = useState(false);
  const [examQuestions, setExamQuestions] = useState<CertQuestion[]>([]);
  const [examIndex, setExamIndex] = useState(0);
  const [examAnswers, setExamAnswers] = useState<boolean[]>([]);

  useEffect(() => {
    if (panelState === "question" && question?.type === "practical") {
      textareaRef.current?.focus();
    }
  }, [panelState, question]);

  function resetQuestionState() {
    setSelectedChoices(new Set());
    setUserSQL("");
    setShowCorrectSQL(false);
    setFeedbackDetail(null);
  }

  async function handleGenerate() {
    setError(null);
    setQuestion(null);
    setIsExamMode(false);
    resetQuestionState();
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
        body: JSON.stringify({ ...body, lang: language }),
      });
      const data = (await res.json()) as { question?: CertQuestion; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Server error");
      setQuestion(data.question!);
      setPanelState("question");
    } catch (err) {
      setError(String(err));
      setPanelState("setup");
    }
  }

  async function handleGenerateExam() {
    setError(null);
    setIsExamMode(true);
    setExamQuestions([]);
    setExamIndex(0);
    setExamAnswers([]);
    setScore({ correct: 0, total: 0 });
    setPanelState("exam-loading");

    try {
      const res = await fetch("/api/cert/exam", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ lang: language }),
      });
      const data = (await res.json()) as { questions?: CertQuestion[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Server error");
      const qs = data.questions!;
      setExamQuestions(qs);
      setQuestion(qs[0]);
      resetQuestionState();
      setPanelState("question");
    } catch (err) {
      setError(String(err));
      setIsExamMode(false);
      setPanelState("setup");
    }
  }

  function recordResult(correct: boolean) {
    if (isExamMode) {
      setExamAnswers((prev) => [...prev, correct]);
    }
    setScore((s) => ({
      correct: s.correct + (correct ? 1 : 0),
      total: s.total + 1,
    }));
    setIsCorrect(correct);
    setPanelState("feedback");
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
    if (!question || (question.type !== "qcu" && question.type !== "qcm")) return;
    const q = question as CertQuestionQCU | CertQuestionQCM;
    const correct =
      selectedChoices.size === q.correctAnswers.length &&
      q.correctAnswers.every((a) => selectedChoices.has(a));
    recordResult(correct);
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
        setFeedbackDetail(t('cert.sqlError', { error: actual.error }));
        recordResult(false);
        return;
      }

      const match = resultsMatch(
        actual.columns,
        actual.rows,
        expected.columns,
        expected.rows,
      );

      if (!match) {
        const detail =
          actual.rowCount !== expected.rowCount
            ? t('cert.practical.rowMismatch', { actual: actual.rowCount, expected: expected.rowCount })
            : actual.columns.length !== expected.columns.length
              ? t('cert.practical.colMismatch', { actual: actual.columns.length, expected: expected.columns.length })
              : t('cert.practical.resultMismatch');
        setFeedbackDetail(detail);
      }

      recordResult(match);
    } finally {
      setIsRunning(false);
    }
  }

  function handleNextQuestion() {
    if (isExamMode) {
      const nextIndex = examIndex + 1;
      if (nextIndex >= examQuestions.length) {
        setPanelState("exam-results");
      } else {
        setExamIndex(nextIndex);
        setQuestion(examQuestions[nextIndex]);
        resetQuestionState();
        setPanelState("question");
      }
    } else {
      setPanelState("setup");
    }
  }

  function handleRestartFromExamResults() {
    setIsExamMode(false);
    setExamQuestions([]);
    setExamIndex(0);
    setExamAnswers([]);
    setScore({ correct: 0, total: 0 });
    setQuestion(null);
    setPanelState("setup");
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
          <span className="text-sm font-semibold">
            {isExamMode ? t('cert.title.exam') : t('cert.title.setup')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Score badge: current score during exam, or session score in single mode */}
          {isExamMode && score.total > 0 && (panelState === "question" || panelState === "feedback") && (
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--ide-surface2)] border border-[var(--ide-border)]"
              title={t('cert.exam.scoreTitle')}
            >
              <Trophy size={10} className="text-yellow-500" />
              <span className="font-medium">
                {score.correct}/{score.total}
              </span>
            </span>
          )}
          {!isExamMode && score.total > 0 && (
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--ide-surface2)] border border-[var(--ide-border)]"
              title={t('cert.exam.sessionScore')}
            >
              <Trophy size={10} className="text-yellow-500" />
              <span className="font-medium">
                {score.correct}/{score.total}
              </span>
            </span>
          )}
          <button
            onClick={onClose}
            aria-label={t('cert.panel.close')}
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
              {t('cert.setup.description')}
            </p>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-2">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--ide-text-2)]">
                {t('cert.setup.partLabel')}
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
                <option value="random">{t('cert.setup.random')}</option>
                {([1, 2, 3, 4] as CertPart[]).map((p) => (
                  <option key={p} value={p}>
                    {t(`cert.part.${p}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--ide-text-2)]">
                {t('cert.setup.typeLabel')}
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
                <option value="random">{t('cert.setup.random')}</option>
                {(["qcu", "qcm", "practical"] as CertQuestionType[]).map((qt) => (
                  <option key={qt} value={qt}>
                    {t(`cert.type.${qt}`)}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={13} />
              {t('cert.setup.generateQuestion')}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-[var(--ide-border)]" />
              <span className="text-xs text-[var(--ide-text-3)]">{t('cert.setup.or')}</span>
              <div className="flex-1 h-px bg-[var(--ide-border)]" />
            </div>

            {/* Exam generation */}
            <button
              onClick={handleGenerateExam}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-600/10 rounded-lg text-sm font-medium transition-colors"
            >
              <ClipboardList size={13} />
              {t('cert.setup.generateExam')}
            </button>
            <p className="text-xs text-[var(--ide-text-3)] text-center -mt-1.5">
              {t('cert.setup.estimatedCost')} : ~{EXAM_COST.usd.toFixed(2)} $ ≈ {EXAM_COST.eur.toFixed(2)} €
            </p>
          </>
        )}

        {/* ── Loading (single question) ────────────────────────────────── */}
        {panelState === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-[var(--ide-text-3)]">
            <Loader2 size={22} className="animate-spin text-emerald-500" />
            <p className="text-xs">{t('cert.loading.question')}</p>
          </div>
        )}

        {/* ── Exam loading ─────────────────────────────────────────────── */}
        {panelState === "exam-loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-[var(--ide-text-3)]">
            <Loader2 size={22} className="animate-spin text-emerald-500" />
            <p className="text-xs font-medium">{t('cert.loading.exam')}</p>
            <p className="text-xs text-center leading-relaxed max-w-48">
              {t('cert.loading.examDetail')}
            </p>
          </div>
        )}

        {/* ── Question ────────────────────────────────────────────────────── */}
        {panelState === "question" && question && (
          <>
            {/* Exam progress bar */}
            {isExamMode && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-[var(--ide-text-3)]">
                  <span>{t('cert.question.progress', { current: examIndex + 1, total: examQuestions.length })}</span>
                  <span>{Math.round((examIndex / examQuestions.length) * 100)}%</span>
                </div>
                <div className="h-1 bg-[var(--ide-surface2)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${(examIndex / examQuestions.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full dark:bg-emerald-600/20 bg-emerald-100 dark:text-emerald-300 text-emerald-700 dark:border-emerald-600/40 border-emerald-400 border font-medium">
                {t(`cert.part.${question.part}`)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--ide-surface2)] text-[var(--ide-text-2)] border border-[var(--ide-border)]">
                {t(`cert.type.${question.type}`)}
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
                  {t('cert.question.validate')}
                </button>
              </div>
            )}

            {/* QCM */}
            {question.type === "qcm" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--ide-text-3)]">
                  {t('cert.question.multipleAnswers')}
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
                  {t('cert.question.validate')}
                </button>
              </div>
            )}

            {/* Practical */}
            {question.type === "practical" && (
              <div className="flex flex-col gap-3">
                <SchemaBlock sql={(question as CertQuestionPractical).schemaSQL} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--ide-text-2)]">
                    {t('cert.question.yourSQL')}
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={userSQL}
                    onChange={(e) => setUserSQL(e.target.value)}
                    placeholder={t('cert.question.sqlPlaceholder')}
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
                      {t('cert.question.checking')}
                    </>
                  ) : (
                    t('cert.question.validateAnswer')
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
              {isCorrect ? t('cert.feedback.correct') : t('cert.feedback.incorrect')}
            </div>

            {/* QCU/QCM revealed choices */}
            {(question.type === "qcu" || question.type === "qcm") && (
              <div className="flex flex-col gap-1.5">
                {(question as CertQuestionQCU | CertQuestionQCM).choices.map((c) => (
                  <ChoiceButton
                    key={c.label}
                    label={c.label}
                    text={c.text}
                    selected={selectedChoices.has(c.label)}
                    correct={(question as CertQuestionQCU).correctAnswers.includes(c.label)}
                    revealed={true}
                    multi={question.type === "qcm"}
                    onClick={() => {}}
                  />
                ))}
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
              <p className="font-semibold text-[var(--ide-text)] mb-1">{t('cert.feedback.explanation')}</p>
              {question.explanation}
            </div>

            {/* Show correct SQL (practical only) */}
            {question.type === "practical" && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setShowCorrectSQL((v) => !v)}
                  className="flex items-center gap-1.5 text-xs dark:text-emerald-400 text-emerald-600 dark:hover:text-emerald-300 hover:text-emerald-700 transition-colors"
                >
                  {showCorrectSQL ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {showCorrectSQL ? t('cert.feedback.hideSolution') : t('cert.feedback.showSolution')}
                </button>
                {showCorrectSQL && (
                  <pre className="text-xs font-mono bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed text-[var(--ide-text-2)]">
                    {(question as CertQuestionPractical).correctSQL}
                  </pre>
                )}
              </div>
            )}

            {/* Next */}
            <button
              onClick={handleNextQuestion}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={13} />
              {isExamMode
                ? examIndex + 1 < examQuestions.length
                  ? t('cert.feedback.nextQuestion')
                  : t('cert.feedback.seeResults')
                : t('cert.feedback.nextQuestion')}
            </button>
          </>
        )}

        {/* ── Exam results ─────────────────────────────────────────────── */}
        {panelState === "exam-results" && (
          <ExamResultsScreen
            questions={examQuestions}
            answers={examAnswers}
            onRestart={handleRestartFromExamResults}
          />
        )}
      </div>
    </div>
  );
}
