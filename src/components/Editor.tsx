import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, gutter } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { bracketMatching, foldGutter, foldKeymap } from '@codemirror/language'
import { format } from 'sql-formatter'

interface EditorProps {
  value: string
  onChange: (val: string) => void
  onRun: () => void
  isDark: boolean
  schema?: Record<string, string[]>
  dialect?: 'sqlite' | 'mysql' | 'mariadb' | 'postgresql' | 'duckdb'
}

export interface EditorHandle {
  formatSQL: () => void
}

const themeCompartment = new Compartment()
const schemaCompartment = new Compartment()

function buildThemeExtension(isDark: boolean) {
  const base = EditorView.theme({
    '&': { height: '100%', background: 'var(--ide-bg)' },
    '.cm-content': { padding: '12px 0' },
    '.cm-gutters': { background: 'var(--ide-surface)', borderRight: '1px solid var(--ide-border)' },
    '.cm-activeLineGutter': { background: 'var(--ide-surface2)' },
    '.cm-activeLine': { background: 'var(--ide-surface2)' },
    '.cm-cursor': { borderLeftColor: isDark ? '#c0caf5' : '#1e293b' },
    '.cm-selectionBackground': { background: isDark ? '#283457' : '#bfdbfe' },
    '&.cm-focused .cm-selectionBackground': { background: isDark ? '#283457' : '#bfdbfe' },
    '.cm-lineNumbers .cm-gutterElement': { color: 'var(--ide-text-3)' },
  })
  return isDark ? [base, oneDark] : [base]
}

import type { SqlLanguage } from 'sql-formatter'

// sql-formatter dialect names differ slightly from our DbEngine type
const FORMATTER_DIALECT: Record<string, SqlLanguage> = {
  sqlite: 'sqlite',
  duckdb: 'sql', // no native duckdb dialect — standard SQL is close enough
  mysql: 'mysql',
  mariadb: 'mariadb',
  postgresql: 'postgresql',
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { value, onChange, onRun, isDark, schema, dialect = 'sqlite' },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onRunRef = useRef(onRun)

  useImperativeHandle(ref, () => ({
    formatSQL() {
      const view = viewRef.current
      if (!view) return
      const raw = view.state.doc.toString()
      try {
        const formatted = format(raw, { language: FORMATTER_DIALECT[dialect] ?? 'sql', tabWidth: 2, keywordCase: 'upper' })
        view.dispatch({ changes: { from: 0, to: raw.length, insert: formatted } })
      } catch { /* unparseable SQL — leave as-is */ }
    }
  }))

  useEffect(() => { onRunRef.current = onRun }, [onRun])

  useEffect(() => {
    if (!containerRef.current) return

    const runCmd = {
      key: 'Ctrl-Enter',
      mac: 'Cmd-Enter',
      run: () => { onRunRef.current(); return true }
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        gutter({ class: 'cm-breakpoint-gutter' }),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        foldGutter(),
        autocompletion(),
        schemaCompartment.of(sql({ schema: schema ?? {} })),
        themeCompartment.of(buildThemeExtension(isDark)),
        keymap.of([runCmd, ...defaultKeymap, ...historyKeymap, ...completionKeymap, ...foldKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString())
        }),
      ]
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync value changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  // Dynamically reconfigure theme without destroying the editor
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(buildThemeExtension(isDark))
    })
  }, [isDark])

  // Reconfigure SQL schema for autocompletion when tables/columns change
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: schemaCompartment.reconfigure(sql({ schema: schema ?? {} }))
    })
  }, [schema])

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />
})
