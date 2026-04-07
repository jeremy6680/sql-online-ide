import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DbEngine, HistoryEntry, QueryResult, RemoteConnection, TableInfo, ChartType, FavoriteQuery, SavedConnection, AuthState, QueryTab } from './types'

export type AiProvider = 'anthropic' | 'openai'

// Anthropic models available to users
export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (powerful)' },
] as const

// OpenAI models available to users
export const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast)' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'o1-mini', label: 'o1-mini' },
] as const

interface AppState {
  // Auth
  auth: AuthState
  setAuth: (auth: AuthState) => void
  logout: () => void

  // AI provider/model preferences (persisted, never stores actual keys)
  aiProvider: AiProvider
  setAiProvider: (p: AiProvider) => void
  aiModel: string
  setAiModel: (m: string) => void
  /** Which providers have a stored key on the server (fetched after login) */
  aiKeyPresence: { anthropic: boolean; openai: boolean }
  setAiKeyPresence: (p: { anthropic: boolean; openai: boolean }) => void

  // Engine
  engine: DbEngine
  setEngine: (e: DbEngine) => void

  // SQL
  sql: string
  setSql: (s: string) => void

  // Results
  result: QueryResult | null
  setResult: (r: QueryResult | null) => void
  isLoading: boolean
  setIsLoading: (v: boolean) => void

  // Tables
  tables: TableInfo[]
  setTables: (t: TableInfo[]) => void
  selectedTable: string | null
  setSelectedTable: (t: string | null) => void

  // History
  history: HistoryEntry[]
  setHistory: (entries: HistoryEntry[]) => void
  addHistory: (e: HistoryEntry) => void
  clearHistory: () => void

  // Remote connection
  remoteConnection: RemoteConnection | null
  setRemoteConnection: (c: RemoteConnection | null) => void

  // Chart
  chartType: ChartType
  setChartType: (t: ChartType) => void

  // Favorite queries
  favoriteQueries: FavoriteQuery[]
  setFavoriteQueries: (queries: FavoriteQuery[]) => void
  addFavoriteQuery: (q: FavoriteQuery) => void
  removeFavoriteQuery: (id: string) => void

  // Saved connections
  savedConnections: SavedConnection[]
  setSavedConnections: (c: SavedConnection[]) => void
  addSavedConnection: (c: SavedConnection) => void
  removeSavedConnection: (id: string) => void

  // Panels
  showHistory: boolean
  toggleHistory: () => void
  showSidebar: boolean
  toggleSidebar: () => void
  certPanelOpen: boolean
  setCertPanelOpen: (open: boolean) => void

  // Theme
  theme: 'dark' | 'light'
  toggleTheme: () => void

  // Language
  language: 'en' | 'fr'
  setLanguage: (lang: 'en' | 'fr') => void

  // Query tabs
  tabs: QueryTab[]
  activeTabId: string
  addTab: () => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabSql: (id: string, sql: string) => void
  updateTabName: (id: string, name: string) => void
  updateTabEngine: (id: string, engine: DbEngine) => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      auth: { token: null, username: null, authEnabled: true },
      setAuth: (auth) => set({ auth }),
      logout: () => set({
        auth: { token: null, username: null, authEnabled: true },
        aiKeyPresence: { anthropic: false, openai: false },
        // Clear per-user data so the next user doesn't inherit them from localStorage
        history: [],
        favoriteQueries: [],
        savedConnections: [],
      }),

      aiProvider: 'anthropic',
      setAiProvider: (aiProvider) => set({ aiProvider }),
      aiModel: 'claude-haiku-4-5-20251001',
      setAiModel: (aiModel) => set({ aiModel }),
      aiKeyPresence: { anthropic: false, openai: false },
      setAiKeyPresence: (aiKeyPresence) => set({ aiKeyPresence }),

      engine: 'sqlite',
      setEngine: (engine) => set({ engine }),

      sql: '-- Welcome to SQL Online IDE\n-- Select your database engine above, then write your queries here\n\nCREATE TABLE IF NOT EXISTS users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE,\n  created_at TEXT DEFAULT CURRENT_TIMESTAMP\n);\n\nINSERT INTO users (name, email) VALUES\n  (\'Alice\', \'alice@example.com\'),\n  (\'Bob\', \'bob@example.com\'),\n  (\'Charlie\', \'charlie@example.com\');\n\nSELECT * FROM users;',
      setSql: (sql) => set({ sql }),

      result: null,
      setResult: (result) => set({ result }),
      isLoading: false,
      setIsLoading: (isLoading) => set({ isLoading }),

      tables: [],
      setTables: (tables) => set({ tables }),
      selectedTable: null,
      setSelectedTable: (selectedTable) => set({ selectedTable }),

      history: [],
      setHistory: (entries) => set({ history: entries }),
      addHistory: (entry) => set((state) => ({
        history: [entry, ...state.history].slice(0, 100)
      })),
      clearHistory: () => set({ history: [] }),

      remoteConnection: null,
      setRemoteConnection: (remoteConnection) => set({ remoteConnection }),

      chartType: 'none',
      setChartType: (chartType) => set({ chartType }),

      favoriteQueries: [],
      setFavoriteQueries: (queries) => set({ favoriteQueries: queries }),
      addFavoriteQuery: (q) => set((state) => ({ favoriteQueries: [q, ...state.favoriteQueries] })),
      removeFavoriteQuery: (id) => set((state) => ({ favoriteQueries: state.favoriteQueries.filter(q => q.id !== id) })),

      savedConnections: [],
      setSavedConnections: (savedConnections) => set({ savedConnections }),
      addSavedConnection: (c) => set((state) => ({ savedConnections: [c, ...state.savedConnections] })),
      removeSavedConnection: (id) => set((state) => ({ savedConnections: state.savedConnections.filter(c => c.id !== id) })),

      showHistory: false,
      toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),
      showSidebar: true,
      toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),
      certPanelOpen: false,
      setCertPanelOpen: (open) => set({ certPanelOpen: open }),

      theme: 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

      language: 'en',
      setLanguage: (language) => set({ language }),

      tabs: [{ id: 'tab-1', name: 'Query 1', sql: '', engine: 'sqlite' }],
      activeTabId: 'tab-1',
      addTab: () => set((state) => {
        const id = crypto.randomUUID()
        const n = state.tabs.length + 1
        return {
          tabs: [...state.tabs, { id, name: `Query ${n}`, sql: '', engine: state.engine }],
          activeTabId: id,
        }
      }),
      closeTab: (id) => set((state) => {
        if (state.tabs.length === 1) return {} // always keep at least one tab
        const idx = state.tabs.findIndex(t => t.id === id)
        const next = state.tabs[idx === 0 ? 1 : idx - 1]
        return {
          tabs: state.tabs.filter(t => t.id !== id),
          activeTabId: state.activeTabId === id ? next.id : state.activeTabId,
        }
      }),
      setActiveTab: (id) => set({ activeTabId: id }),
      updateTabSql: (id, sql) => set((state) => ({
        tabs: state.tabs.map(t => t.id === id ? { ...t, sql } : t)
      })),
      updateTabName: (id, name) => set((state) => ({
        tabs: state.tabs.map(t => t.id === id ? { ...t, name } : t)
      })),
      updateTabEngine: (id, engine) => set((state) => ({
        tabs: state.tabs.map(t => t.id === id ? { ...t, engine } : t)
      })),
    }),
    {
      name: 'sql-ide-storage',
      // Persist token/username + UI preferences. authEnabled always refetched from server.
      // aiKeyPresence is NOT persisted — always refetched from server on login.
      partialize: (state) => ({
        auth: { token: state.auth.token, username: state.auth.username },
        history: state.history,
        sql: state.sql,
        favoriteQueries: state.favoriteQueries,
        savedConnections: state.savedConnections,
        theme: state.theme,
        language: state.language,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        aiProvider: state.aiProvider,
        aiModel: state.aiModel,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<AppState>),
        auth: {
          ...current.auth, // keeps authEnabled: true from default
          ...((persisted as { auth?: Partial<AppState['auth']> }).auth ?? {}),
        },
      }),
    }
  )
)
