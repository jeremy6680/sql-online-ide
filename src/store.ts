import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DbEngine, HistoryEntry, QueryResult, RemoteConnection, TableInfo, ChartType, FavoriteQuery, SavedConnection, AuthState } from './types'

interface AppState {
  // Auth
  auth: AuthState
  setAuth: (auth: AuthState) => void
  logout: () => void

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
  addSavedConnection: (c: SavedConnection) => void
  removeSavedConnection: (id: string) => void

  // Panels
  showHistory: boolean
  toggleHistory: () => void
  showSidebar: boolean
  toggleSidebar: () => void

  // Theme
  theme: 'dark' | 'light'
  toggleTheme: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      auth: { token: null, username: null, authEnabled: true },
      setAuth: (auth) => set({ auth }),
      logout: () => set({ auth: { token: null, username: null, authEnabled: true } }),

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
      addSavedConnection: (c) => set((state) => ({ savedConnections: [c, ...state.savedConnections] })),
      removeSavedConnection: (id) => set((state) => ({ savedConnections: state.savedConnections.filter(c => c.id !== id) })),

      showHistory: false,
      toggleHistory: () => set((state) => ({ showHistory: !state.showHistory })),
      showSidebar: true,
      toggleSidebar: () => set((state) => ({ showSidebar: !state.showSidebar })),

      theme: 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'sql-ide-storage',
      // Only persist token + username — authEnabled is always fetched fresh from the server
      partialize: (state) => ({
        auth: { token: state.auth.token, username: state.auth.username },
        history: state.history,
        sql: state.sql,
        favoriteQueries: state.favoriteQueries,
        savedConnections: state.savedConnections,
        theme: state.theme,
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
