import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, gutter } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { bracketMatching, foldGutter, foldKeymap } from '@codemirror/language'

interface EditorProps {
  value: string
  onChange: (val: string) => void
  onRun: () => void
  isDark: boolean
}

const themeCompartment = new Compartment()

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

export function Editor({ value, onChange, onRun, isDark }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onRunRef = useRef(onRun)

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
        sql(),
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

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />
}
