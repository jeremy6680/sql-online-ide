// src/types.ts

export type DbEngine = "sqlite" | "duckdb" | "mysql" | "mariadb" | "postgresql";

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTime: number;
  error?: string;
  statementIndex?: number;
  statementTotal?: number;
}

export interface TableInfo {
  name: string;
  type: "table" | "view";
}

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

/**
 * Represents a foreign key relationship between two tables.
 * Used by the Schema diagram to draw relationship arrows.
 */
export interface ForeignKeyInfo {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface HistoryEntry {
  id: string;
  query: string;
  engine: DbEngine;
  timestamp: number;
  success: boolean;
  rowCount?: number;
}

export interface RemoteConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export type ChartType = "bar" | "line" | "pie" | "bubble" | "none";

export interface FavoriteQuery {
  id: string;
  name: string;
  query: string;
  engine: DbEngine;
  createdAt: number;
}

export interface SavedConnection {
  id: string;
  name: string;
  engine: DbEngine;
  connection: RemoteConnection;
}

export interface AuthState {
  token: string | null;
  username: string | null;
  authEnabled: boolean;
}

export interface QueryTab {
  id: string;
  name: string;
  sql: string;
  engine: DbEngine;
}

// ─── ENI SQL Certification Prep ───────────────────────────────────────────────

export type CertPart = 1 | 2 | 3 | 4;
export type CertQuestionType = 'qcu' | 'qcm' | 'practical';

export interface CertChoice {
  label: 'A' | 'B' | 'C' | 'D';
  /** Plain text or SQL snippet displayed as the choice */
  text: string;
}

interface CertQuestionBase {
  id: string;
  part: CertPart;
  type: CertQuestionType;
  /** Optional scenario description shown above the question */
  context?: string;
  questionText: string;
  explanation: string;
}

export interface CertQuestionQCU extends CertQuestionBase {
  type: 'qcu';
  choices: CertChoice[];
  correctAnswers: string[];
}

export interface CertQuestionQCM extends CertQuestionBase {
  type: 'qcm';
  choices: CertChoice[];
  correctAnswers: string[];
}

/** Practical (cas pratique) question — user writes SQL against a given schema */
export interface CertQuestionPractical extends CertQuestionBase {
  type: 'practical';
  /** CREATE TABLE + INSERT statements to set up the scenario */
  schemaSQL: string;
  /** Correct SQL query (hidden until submission, used client-side for comparison) */
  correctSQL: string;
}

export type CertQuestion = CertQuestionQCU | CertQuestionQCM | CertQuestionPractical;
