import { useState, useEffect, useRef } from 'react'
import { X, Database, Star, Trash2, Save } from 'lucide-react'
import type { DbEngine, RemoteConnection, SavedConnection } from '../types'

interface ConnectionModalProps {
  engine: DbEngine
  onConnect: (conn: RemoteConnection) => void
  onClose: () => void
  currentConnection: RemoteConnection | null
  savedConnections: SavedConnection[]
  onSaveConnection: (c: SavedConnection) => void
  onDeleteConnection: (id: string) => void
}

const ENGINE_COLORS: Record<DbEngine, string> = {
  sqlite:     'bg-blue-600',
  duckdb:     'bg-yellow-600',
  mysql:      'bg-orange-600',
  mariadb:    'bg-teal-600',
  postgresql: 'bg-indigo-600',
}

export function ConnectionModal({
  engine, onConnect, onClose, currentConnection,
  savedConnections, onSaveConnection, onDeleteConnection
}: ConnectionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }

    modal.addEventListener('keydown', handleKeyDown)
    return () => modal.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const [form, setForm] = useState<RemoteConnection>(currentConnection || {
    host: 'localhost',
    port: engine === 'postgresql' ? 5432 : 3306,
    user: engine === 'postgresql' ? 'postgres' : 'root',
    password: '',
    database: ''
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const relevantSaved = savedConnections.filter(c => c.engine === engine)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine, connection: form })
      })
      const data = await res.json()
      setTestResult(data.ok ? '✓ Connection successful' : `✗ ${data.error}`)
    } catch {
      setTestResult('✗ Could not reach server')
    }
    setTesting(false)
  }

  const handleSave = () => {
    if (!saveName.trim()) return
    onSaveConnection({
      id: crypto.randomUUID(),
      name: saveName.trim(),
      engine,
      connection: { ...form }
    })
    setSaveName('')
    setShowSaveInput(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm" aria-hidden="true">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-modal-title"
        className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-xl w-[480px] shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ide-border)]">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-blue-400" />
            <span id="connection-modal-title" className="font-semibold capitalize">{engine} Connection</span>
          </div>
          <button onClick={onClose} className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)]"><X size={16} /></button>
        </div>

        {/* Saved connections for this engine */}
        {relevantSaved.length > 0 && (
          <div className="px-5 pt-4">
            <p className="text-xs text-[var(--ide-text-3)] uppercase tracking-wider mb-2">Saved connections</p>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {relevantSaved.map((saved) => (
                <div
                  key={saved.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[var(--ide-surface)] rounded-lg border border-[var(--ide-border)] hover:border-blue-500/50 cursor-pointer group"
                  onClick={() => setForm({ ...saved.connection })}
                >
                  <Star size={11} className="text-yellow-400 fill-yellow-400 shrink-0" />
                  <span className="text-sm text-[var(--ide-text)] flex-1 truncate">{saved.name}</span>
                  <span className="text-xs text-[var(--ide-text-4)] font-mono truncate">{saved.connection.host}/{saved.connection.database}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteConnection(saved.id) }}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--ide-border)] mt-3" />
          </div>
        )}

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-[var(--ide-text-2)] mb-1">Host</label>
              <input
                className="w-full bg-[var(--ide-surface)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-[var(--ide-text)]"
                value={form.host}
                onChange={e => setForm({ ...form, host: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ide-text-2)] mb-1">Port</label>
              <input
                className="w-full bg-[var(--ide-surface)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-[var(--ide-text)]"
                value={form.port}
                type="number"
                onChange={e => setForm({ ...form, port: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--ide-text-2)] mb-1">Database</label>
            <input
              className="w-full bg-[var(--ide-surface)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-[var(--ide-text)]"
              value={form.database}
              onChange={e => setForm({ ...form, database: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--ide-text-2)] mb-1">User</label>
              <input
                className="w-full bg-[var(--ide-surface)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-[var(--ide-text)]"
                value={form.user}
                onChange={e => setForm({ ...form, user: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--ide-text-2)] mb-1">Password</label>
              <input
                type="password"
                className="w-full bg-[var(--ide-surface)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-[var(--ide-text)]"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          {/* Save connection input */}
          {showSaveInput && (
            <div className="flex gap-2">
              <input
                autoFocus
                className="flex-1 bg-[var(--ide-surface)] border border-yellow-500/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 text-[var(--ide-text)]"
                placeholder="Connection name (e.g. jeremydb local)"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false) }}
              />
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm disabled:opacity-40"
              >
                <Save size={13} />
              </button>
              <button onClick={() => setShowSaveInput(false)} className="px-3 py-2 text-[var(--ide-text-3)] hover:text-[var(--ide-text)]">
                <X size={13} />
              </button>
            </div>
          )}

          {testResult && (
            <div className={`text-sm px-3 py-2 rounded ${testResult.startsWith('✓') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
              {testResult}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--ide-border)]">
          <button
            onClick={() => setShowSaveInput(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-yellow-400 hover:text-yellow-300 border border-[var(--ide-border)] hover:border-yellow-500/50 rounded-lg"
          >
            <Star size={13} /> Save connection
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 text-sm border border-[var(--ide-border)] rounded-lg hover:bg-[var(--ide-surface2)] disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test'}
            </button>
            <button
              onClick={() => onConnect(form)}
              className={`px-4 py-2 text-sm ${ENGINE_COLORS[engine]} hover:opacity-90 rounded-lg font-medium text-white`}
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
