import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, PlusCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { getBooks, getSections } from '../api/client'
import BookCard from '../components/BookCard'

export default function Collection() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sectionFilter, setSectionFilter] = useState<number | null>(null)

  const { data: sections } = useQuery({
    queryKey: ['sections'],
    queryFn: () => getSections().then((r) => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['books', page, search, sectionFilter],
    queryFn: () =>
      getBooks({
        page,
        page_size: 24,
        search: search || undefined,
        section_id: sectionFilter ?? undefined,
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const books = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Collection</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} book{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate('/add')} className="btn-primary self-start sm:self-auto">
          <PlusCircle size={18} /> Add Book
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
          <input
            className="input flex-1"
            placeholder="Search title or author…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn-secondary px-3">
            <Search size={16} />
          </button>
        </form>

        {/* Section tabs */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => { setSectionFilter(null); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sectionFilter === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Tutti
          </button>
          {sections?.map((s: { id: number; name: string }) => (
            <button
              key={s.id}
              onClick={() => { setSectionFilter(s.id); setPage(1) }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                sectionFilter === s.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Books grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="aspect-[2/3] bg-gray-200 rounded-t-xl" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-gray-200 rounded" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500">No books found</h3>
          {!search && (
            <p className="text-sm text-gray-400 mt-1">
              Add your first book using the button above.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {books.map((book: { id: number }) => (
            <BookCard key={book.id} book={book as any} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary px-3 py-2"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600">Page {page} of {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="btn-secondary px-3 py-2"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
