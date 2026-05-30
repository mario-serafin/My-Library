import { BookOpen, CheckCircle } from 'lucide-react'

export interface BookCandidate {
  open_library_id?: string
  title: string
  author?: string
  year?: number
  isbn?: string
  cover_url?: string
  genres?: string
  publisher?: string
  page_count?: number
  language?: string
  confidence: number
}

interface Props {
  candidates: BookCandidate[]
  onSelect: (candidate: BookCandidate) => void
  loading?: boolean
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 55 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-9 text-right">{pct}%</span>
    </div>
  )
}

export default function BookSearchResults({ candidates, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-3 animate-pulse flex gap-3">
            <div className="w-12 h-16 bg-gray-200 rounded" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!candidates.length) {
    return (
      <div className="text-center py-8 text-gray-400">
        <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No books found. Try adjusting the title or author.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {candidates.map((c, i) => (
        <button
          key={c.open_library_id ?? i}
          onClick={() => onSelect(c)}
          className="w-full card p-3 flex gap-3 text-left hover:border-blue-300 hover:shadow transition-all"
        >
          <div className="flex-shrink-0 w-12 h-16 bg-gray-100 rounded overflow-hidden">
            {c.cover_url ? (
              <img src={c.cover_url} alt={c.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <BookOpen size={20} className="text-gray-300" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{c.title}</p>
            {c.author && <p className="text-xs text-gray-500 mt-0.5 truncate">{c.author}</p>}
            <div className="flex gap-2 items-center mt-0.5 flex-wrap">
              {c.year && <span className="text-xs text-gray-400">{c.year}</span>}
              {c.publisher && <span className="text-xs text-gray-400 truncate">{c.publisher}</span>}
            </div>
            {c.genres && <p className="text-xs text-blue-500 mt-0.5 truncate">{c.genres}</p>}
            <div className="mt-1.5">
              <ConfidenceBar value={c.confidence} />
            </div>
          </div>
          {i === 0 && c.confidence >= 0.75 && (
            <div className="flex-shrink-0 self-center">
              <CheckCircle size={18} className="text-green-500" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
