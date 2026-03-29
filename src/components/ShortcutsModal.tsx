import { useEffect } from 'react'
import { X, Keyboard } from 'lucide-react'

const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], mac: ['⌘', '↵'], description: 'Run query' },
  { keys: ['Ctrl', 'Z'], mac: ['⌘', 'Z'], description: 'Undo' },
  { keys: ['Ctrl', 'Shift', 'Z'], mac: ['⌘', '⇧', 'Z'], description: 'Redo' },
  { keys: ['Ctrl', '/'], mac: ['⌘', '/'], description: 'Toggle line comment' },
  { keys: ['Ctrl', 'F'], mac: ['⌘', 'F'], description: 'Find in editor' },
  { keys: ['Tab'], mac: ['Tab'], description: 'Accept autocomplete suggestion' },
  { keys: ['Escape'], mac: ['Escape'], description: 'Close modal / dismiss autocomplete' },
  { keys: ['?'], mac: ['?'], description: 'Open this shortcuts reference' },
]

interface ShortcutsModalProps {
  onClose: () => void
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const isMac = navigator.platform.toUpperCase().includes('MAC')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"
      aria-hidden="true"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
        className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-xl w-[420px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ide-border)]">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-blue-400" />
            <span id="shortcuts-modal-title" className="font-semibold">Keyboard shortcuts</span>
          </div>
          <button onClick={onClose} aria-label="Close shortcuts" className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-1.5">
          {SHORTCUTS.map(({ keys, mac, description }) => (
            <div key={description} className="flex items-center justify-between gap-4">
              <span className="text-sm text-[var(--ide-text-2)]">{description}</span>
              <div className="flex items-center gap-1 shrink-0">
                {(isMac ? mac : keys).map((k) => (
                  <kbd
                    key={k}
                    className="px-1.5 py-0.5 text-xs bg-[var(--ide-surface2)] border border-[var(--ide-border)] rounded font-mono text-[var(--ide-text)]"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[var(--ide-border)] text-xs text-[var(--ide-text-4)]">
          Press <kbd className="px-1 py-0.5 bg-[var(--ide-surface2)] border border-[var(--ide-border)] rounded font-mono">?</kbd> anywhere to open this panel
        </div>
      </div>
    </div>
  )
}
