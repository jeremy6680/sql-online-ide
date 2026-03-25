import { Star, Trash2, Database } from 'lucide-react'
import type { FavoriteQuery, DbEngine } from '../types'

const ENGINE_COLORS: Record<DbEngine, string> = {
  sqlite:     'text-blue-400',
  duckdb:     'text-yellow-400',
  mysql:      'text-orange-400',
  mariadb:    'text-teal-400',
  postgresql: 'text-indigo-400',
}

interface FavoritesPanelProps {
  favorites: FavoriteQuery[]
  onSelect: (query: string) => void
  onDelete: (id: string) => void
}

export function FavoritesPanel({ favorites, onSelect, onDelete }: FavoritesPanelProps) {
  if (favorites.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--ide-text-4)] text-center">
        <Star size={24} className="mx-auto mb-2 opacity-30" />
        No favorites yet.<br />
        Click ★ in the toolbar to save a query.
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full">
      {favorites.map((fav) => (
        <div
          key={fav.id}
          className="px-3 py-2 border-b border-[var(--ide-border)]/50 hover:bg-[var(--ide-surface2)] group cursor-pointer"
          onClick={() => onSelect(fav.query)}
        >
          <div className="flex items-center gap-2 mb-1">
            <Star size={11} className="text-yellow-400 shrink-0 fill-yellow-400" />
            <span className="text-sm text-[var(--ide-text)] font-medium flex-1 truncate">{fav.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(fav.id) }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-300"
            >
              <Trash2 size={11} />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Database size={10} className={ENGINE_COLORS[fav.engine]} />
            <span className={`text-xs uppercase font-mono ${ENGINE_COLORS[fav.engine]}`}>{fav.engine}</span>
            <span className="text-xs text-[var(--ide-text-4)] ml-auto">
              {new Date(fav.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="text-xs font-mono text-[var(--ide-text-2)] line-clamp-2 whitespace-pre-wrap">
            {fav.query}
          </div>
        </div>
      ))}
    </div>
  )
}
