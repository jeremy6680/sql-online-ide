// src/components/SchemaView.tsx
//
// ERD-style schema diagram rendered as plain SVG.
// Tables are laid out in a responsive grid, columns are listed with type badges,
// PK/FK markers, and relationship arrows are drawn between FK columns.
//
// Design goals:
//   - Zero external dependencies (pure SVG + React)
//   - Works with all 5 engines (SQLite, DuckDB, MySQL, MariaDB, PostgreSQL)
//   - Respects the dark/light CSS variable theme system
//   - Accessible: role="img" with aria-label on the SVG

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import type {
  DbEngine,
  RemoteConnection,
  ForeignKeyInfo,
  ColumnInfo,
} from "../types";
import { getSQLiteColumns, getSQLiteForeignKeys } from "../engines/sqlite";
import { getDuckDBColumns, getDuckDBForeignKeys } from "../engines/duckdb";
import { getRemoteColumns, getRemoteForeignKeys } from "../engines/remote";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TableSchema {
  name: string;
  columns: ColumnInfo[];
}

interface SchemaViewProps {
  engine: DbEngine;
  remoteConnection: RemoteConnection | null;
  tables: { name: string; type: "table" | "view" }[];
  isDark: boolean;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const TABLE_WIDTH = 220;
const ROW_HEIGHT = 22; // height per column row
const HEADER_HEIGHT = 32; // table header (name)
const TABLE_PADDING = 0; // inner padding already baked into row heights
const COL_GAP = 60; // horizontal gap between tables
const ROW_GAP = 50; // vertical gap between tables
const COLS_PER_ROW = 3; // tables per grid row before wrapping

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute (x, y) for each table in a simple grid layout */
function computeLayout(
  tableNames: string[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  tableNames.forEach((name, i) => {
    const col = i % COLS_PER_ROW;
    const row = Math.floor(i / COLS_PER_ROW);
    positions.set(name, {
      x: col * (TABLE_WIDTH + COL_GAP) + 20,
      y: row * 0 + 20, // y computed dynamically below
    });
  });
  return positions;
}

/** Compute total height of a table box */
function tableHeight(colCount: number): number {
  return HEADER_HEIGHT + colCount * ROW_HEIGHT + TABLE_PADDING * 2;
}

/** Shorten a SQL type string to fit in the badge: "character varying" → "varchar" */
function shortType(type: string): string {
  const map: Record<string, string> = {
    "character varying": "varchar",
    character: "char",
    integer: "int",
    bigint: "int8",
    smallint: "int2",
    "double precision": "float8",
    boolean: "bool",
    "timestamp without time zone": "timestamp",
    "timestamp with time zone": "timestamptz",
  };
  const lower = type.toLowerCase();
  return map[lower] ?? (type.length > 10 ? type.slice(0, 9) + "…" : type);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SchemaView({
  engine,
  remoteConnection,
  tables,
  isDark,
}: SchemaViewProps) {
  const [schemas, setSchemas] = useState<TableSchema[]>([]);
  const [fks, setFks] = useState<ForeignKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SVG pan/zoom state
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  const loadSchema = useCallback(async () => {
    if (tables.length === 0) {
      setSchemas([]);
      setFks([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Load all columns in parallel
      const schemaResults = await Promise.all(
        tables
          .filter((t) => t.type === "table") // skip views for now
          .map(async (t): Promise<TableSchema> => {
            let cols: ColumnInfo[] = [];
            if (engine === "sqlite") {
              cols = getSQLiteColumns(t.name);
            } else if (engine === "duckdb") {
              cols = await getDuckDBColumns(t.name);
            } else if (remoteConnection) {
              cols = await getRemoteColumns(engine, remoteConnection, t.name);
            }
            return { name: t.name, columns: cols };
          }),
      );

      // Load foreign keys
      let foreignKeys: ForeignKeyInfo[] = [];
      if (engine === "sqlite") {
        foreignKeys = getSQLiteForeignKeys();
      } else if (engine === "duckdb") {
        foreignKeys = await getDuckDBForeignKeys();
      } else if (remoteConnection) {
        foreignKeys = await getRemoteForeignKeys(engine, remoteConnection);
      }

      setSchemas(schemaResults);
      setFks(foreignKeys);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [engine, remoteConnection, tables]);

  // Reload when tables list or engine changes
  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  // ------------------------------------------------------------------
  // Pan / zoom
  // ------------------------------------------------------------------

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale((s) => Math.min(3, Math.max(0.3, s * factor)));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      dragStart.current = {
        x: e.clientX - translate.x,
        y: e.clientY - translate.y,
      };
    },
    [translate],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setTranslate({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // ------------------------------------------------------------------
  // Layout computation
  // ------------------------------------------------------------------

  // Build a height-aware grid layout
  const positions = new Map<string, { x: number; y: number }>();
  {
    let curX = 20;
    let curY = 20;
    let rowMaxHeight = 0;
    schemas.forEach((t, i) => {
      const col = i % COLS_PER_ROW;
      if (col === 0 && i !== 0) {
        curY += rowMaxHeight + ROW_GAP;
        curX = 20;
        rowMaxHeight = 0;
      }
      positions.set(t.name, { x: curX, y: curY });
      curX += TABLE_WIDTH + COL_GAP;
      rowMaxHeight = Math.max(rowMaxHeight, tableHeight(t.columns.length));
    });
  }

  const totalCols = Math.min(schemas.length, COLS_PER_ROW);
  const totalRows = Math.ceil(schemas.length / COLS_PER_ROW);
  const svgWidth = totalCols * (TABLE_WIDTH + COL_GAP) + 40;
  const svgHeight = (() => {
    if (schemas.length === 0) return 200;
    // Sum up row heights considering actual column counts
    let h = 20;
    for (let row = 0; row < totalRows; row++) {
      const rowTables = schemas.slice(
        row * COLS_PER_ROW,
        (row + 1) * COLS_PER_ROW,
      );
      h +=
        Math.max(...rowTables.map((t) => tableHeight(t.columns.length))) +
        ROW_GAP;
    }
    return h + 20;
  })();

  // ------------------------------------------------------------------
  // FK arrow computation
  // ------------------------------------------------------------------

  // For each FK, we draw a cubic bezier from the "from" column to the "to" column
  function fkArrowPath(fk: ForeignKeyInfo): string | null {
    const fromPos = positions.get(fk.fromTable);
    const toPos = positions.get(fk.toTable);
    if (!fromPos || !toPos) return null;

    const fromSchema = schemas.find((s) => s.name === fk.fromTable);
    const toSchema = schemas.find((s) => s.name === fk.toTable);
    if (!fromSchema || !toSchema) return null;

    const fromColIdx = fromSchema.columns.findIndex(
      (c) => c.name === fk.fromColumn,
    );
    const toColIdx = toSchema.columns.findIndex((c) => c.name === fk.toColumn);
    if (fromColIdx === -1 || toColIdx === -1) return null;

    // Y center of the column row
    const fromY =
      fromPos.y + HEADER_HEIGHT + fromColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const toY =
      toPos.y + HEADER_HEIGHT + toColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

    // Determine which side to exit/enter (left vs right) based on relative position
    const fromRight = fromPos.x > toPos.x;
    const fromX = fromRight ? fromPos.x : fromPos.x + TABLE_WIDTH;
    const toX = fromRight ? toPos.x + TABLE_WIDTH : toPos.x;

    const cpOffset = Math.max(60, Math.abs(fromX - toX) * 0.4);
    const fromCpX = fromRight ? fromX - cpOffset : fromX + cpOffset;
    const toCpX = fromRight ? toX + cpOffset : toX - cpOffset;

    return `M ${fromX} ${fromY} C ${fromCpX} ${fromY}, ${toCpX} ${toY}, ${toX} ${toY}`;
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  // Theme-aware colors via CSS variables
  const tokenColor = isDark ? "#7aa2f7" : "#2563eb"; // PK/FK accent
  const typeColor = isDark ? "#9ece6a" : "#16a34a"; // type badge text
  const fkColor = isDark ? "#f7768e" : "#dc2626"; // FK arrow
  const headerBg = isDark ? "#1a1b26" : "#e2e8f0";
  const bodyBg = isDark ? "#16161e" : "#f8fafc";
  const borderCol = isDark ? "#414868" : "#cbd5e1";
  const textMain = isDark ? "#c0caf5" : "#1e293b";
  const textSub = isDark ? "#565f89" : "#94a3b8";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-[var(--ide-text-3)] text-sm">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Loading schema…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-red-400 text-sm">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--ide-text-4)] text-sm">
        No tables found — run a CREATE TABLE statement to get started.
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--ide-border)] shrink-0 text-xs text-[var(--ide-text-3)]"
        style={{ background: "var(--ide-surface)" }}
      >
        <span>
          {schemas.length} table{schemas.length !== 1 ? "s" : ""}
        </span>
        {fks.length > 0 && (
          <span>
            · {fks.length} relationship{fks.length !== 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={() => setScale((s) => Math.min(3, s * 1.2))}
            className="px-2 py-0.5 rounded hover:bg-[var(--ide-surface2)] font-mono"
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <span className="w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.max(0.3, s * 0.8))}
            className="px-2 py-0.5 rounded hover:bg-[var(--ide-surface2)] font-mono"
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            onClick={resetView}
            className="px-2 py-0.5 rounded hover:bg-[var(--ide-surface2)] ml-1"
            title="Reset view"
            aria-label="Reset view"
          >
            Reset
          </button>
          <button
            onClick={loadSchema}
            className="p-1 rounded hover:bg-[var(--ide-surface2)] ml-1"
            title="Refresh schema"
            aria-label="Refresh schema"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* SVG canvas — pan with drag, zoom with wheel */}
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ background: "var(--ide-bg)" }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          role="img"
          aria-label="Database schema diagram"
          style={{ userSelect: "none" }}
        >
          {/* Arrow marker definition for FK lines */}
          <defs>
            <marker
              id="fk-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill={fkColor} />
            </marker>
          </defs>

          {/* Zoomable / pannable group */}
          <g
            transform={`translate(${translate.x}, ${translate.y}) scale(${scale})`}
          >
            {/* FK relationship arrows (drawn first so they appear behind tables) */}
            {fks.map((fk, i) => {
              const path = fkArrowPath(fk);
              if (!path) return null;
              return (
                <g key={i}>
                  <path
                    d={path}
                    fill="none"
                    stroke={fkColor}
                    strokeWidth={1.5}
                    strokeDasharray="5,3"
                    markerEnd="url(#fk-arrow)"
                    opacity={0.7}
                  />
                </g>
              );
            })}

            {/* Table boxes */}
            {schemas.map((table) => {
              const pos = positions.get(table.name);
              if (!pos) return null;
              const h = tableHeight(table.columns.length);

              // Determine which columns are FK columns (to show badge)
              const fkColumns = new Set(
                fks
                  .filter((fk) => fk.fromTable === table.name)
                  .map((fk) => fk.fromColumn),
              );

              return (
                <g key={table.name} transform={`translate(${pos.x}, ${pos.y})`}>
                  {/* Table shadow */}
                  <rect
                    x={3}
                    y={3}
                    width={TABLE_WIDTH}
                    height={h}
                    rx={6}
                    ry={6}
                    fill={isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.08)"}
                  />

                  {/* Table body */}
                  <rect
                    x={0}
                    y={0}
                    width={TABLE_WIDTH}
                    height={h}
                    rx={6}
                    ry={6}
                    fill={bodyBg}
                    stroke={borderCol}
                    strokeWidth={1}
                  />

                  {/* Header */}
                  <rect
                    x={0}
                    y={0}
                    width={TABLE_WIDTH}
                    height={HEADER_HEIGHT}
                    rx={6}
                    ry={6}
                    fill={headerBg}
                  />
                  {/* Header bottom edge (covers rounded bottom of header rect) */}
                  <rect
                    x={0}
                    y={HEADER_HEIGHT - 6}
                    width={TABLE_WIDTH}
                    height={6}
                    fill={headerBg}
                  />
                  {/* Header separator line */}
                  <line
                    x1={0}
                    y1={HEADER_HEIGHT}
                    x2={TABLE_WIDTH}
                    y2={HEADER_HEIGHT}
                    stroke={borderCol}
                    strokeWidth={1}
                  />

                  {/* Table name */}
                  <text
                    x={TABLE_WIDTH / 2}
                    y={HEADER_HEIGHT / 2 + 5}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight="bold"
                    fill={textMain}
                    fontFamily="ui-monospace, monospace"
                  >
                    {table.name}
                  </text>

                  {/* Column rows */}
                  {table.columns.map((col, idx) => {
                    const rowY = HEADER_HEIGHT + idx * ROW_HEIGHT;
                    const isPk = col.pk;
                    const isFk = fkColumns.has(col.name);

                    return (
                      <g key={col.name}>
                        {/* Row hover background (alternating stripes) */}
                        <rect
                          x={1}
                          y={rowY}
                          width={TABLE_WIDTH - 2}
                          height={ROW_HEIGHT}
                          fill={
                            idx % 2 === 0
                              ? "transparent"
                              : isDark
                                ? "rgba(255,255,255,0.02)"
                                : "rgba(0,0,0,0.02)"
                          }
                        />

                        {/* PK/FK icon */}
                        {(isPk || isFk) && (
                          <text
                            x={8}
                            y={rowY + ROW_HEIGHT / 2 + 4}
                            fontSize={9}
                            fill={tokenColor}
                            fontFamily="ui-monospace, monospace"
                          >
                            {isPk ? "PK" : "FK"}
                          </text>
                        )}

                        {/* Column name */}
                        <text
                          x={isPk || isFk ? 30 : 10}
                          y={rowY + ROW_HEIGHT / 2 + 4}
                          fontSize={11}
                          fill={isPk ? tokenColor : textMain}
                          fontWeight={isPk ? "bold" : "normal"}
                          fontFamily="ui-monospace, monospace"
                        >
                          {col.name.length > 18
                            ? col.name.slice(0, 17) + "…"
                            : col.name}
                        </text>

                        {/* Type badge */}
                        <text
                          x={TABLE_WIDTH - 8}
                          y={rowY + ROW_HEIGHT / 2 + 4}
                          fontSize={9}
                          textAnchor="end"
                          fill={typeColor}
                          fontFamily="ui-monospace, monospace"
                          opacity={0.85}
                        >
                          {shortType(col.type)}
                        </text>

                        {/* NOT NULL indicator */}
                        {col.notnull && !isPk && (
                          <text
                            x={TABLE_WIDTH - 8}
                            y={rowY + ROW_HEIGHT / 2 - 3}
                            fontSize={7}
                            textAnchor="end"
                            fill={textSub}
                            fontFamily="ui-sans-serif, sans-serif"
                          >
                            NN
                          </text>
                        )}

                        {/* Row bottom border */}
                        {idx < table.columns.length - 1 && (
                          <line
                            x1={1}
                            y1={rowY + ROW_HEIGHT}
                            x2={TABLE_WIDTH - 1}
                            y2={rowY + ROW_HEIGHT}
                            stroke={borderCol}
                            strokeWidth={0.5}
                            opacity={0.5}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div
        className="flex items-center gap-4 px-3 py-1 border-t border-[var(--ide-border)] text-xs text-[var(--ide-text-3)] shrink-0"
        style={{ background: "var(--ide-surface)" }}
      >
        <span className="flex items-center gap-1">
          <span
            style={{
              color: tokenColor,
              fontFamily: "monospace",
              fontSize: "10px",
              fontWeight: "bold",
            }}
          >
            PK
          </span>
          Primary key
        </span>
        <span className="flex items-center gap-1">
          <span
            style={{
              color: tokenColor,
              fontFamily: "monospace",
              fontSize: "10px",
            }}
          >
            FK
          </span>
          Foreign key
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="8">
            <path
              d="M0,4 C5,4 15,4 20,4"
              stroke={fkColor}
              strokeWidth="1.5"
              strokeDasharray="3,2"
              fill="none"
              markerEnd="url(#fk-arrow)"
            />
          </svg>
          Relationship
        </span>
        <span
          className="flex items-center gap-1"
          style={{
            color: typeColor,
            fontFamily: "monospace",
            fontSize: "10px",
          }}
        >
          type
          <span className="text-[var(--ide-text-3)] font-sans">
            Column type
          </span>
        </span>
        <span className="ml-auto text-[var(--ide-text-4)]">
          Scroll to zoom · Drag to pan
        </span>
      </div>
    </div>
  );
}
