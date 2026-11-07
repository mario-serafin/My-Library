import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, PlusCircle, Search, ChevronLeft, ChevronRight, X } from 'lucide-react'
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
    setSearch(searchInput.trim())
    setPage(1)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  const selectSection = (id: number | null) => {
    setSectionFilter(id)
    setPage(1)
  }

  const books = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  return (
    <div>
      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-8">
        <div className="flex-1">
          <h1 className="page-title">La tua collezione</h1>
          <p className="page-subtitle">
            {total} {total === 1 ? 'libro' : 'libri'}
            {search && <> per «{search}»</>}
          </p>
        </div>
        <button onClick={() => navigate('/add')} className="btn-primary self-start sm:self-auto">
          <PlusCircle size={18} /> Aggiungi libro
        </button>
      </div>

      {/* Ricerca */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            className="input pl-11 pr-10 py-3"
            placeholder="Cerca per titolo o autore…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Cerca per titolo o autore"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn p-1.5"
              aria-label="Cancella ricerca"
              title="Cancella ricerca"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button type="submit" className="btn-secondary px-5">
          Cerca
        </button>
      </form>

      {/* Sezioni */}
      <div className="flex gap-2 flex-wrap mb-8">
        <button
          onClick={() => selectSection(null)}
          className={sectionFilter === null ? 'chip-on' : 'chip-off'}
        >
          Tutte
        </button>
        {sections?.map((s: { id: number; name: string }) => (
          <button
            key={s.id}
            onClick={() => selectSection(s.id)}
            className={sectionFilter === s.id ? 'chip-on' : 'chip-off'}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Griglia libri */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] skeleton rounded-xl" />
              <div className="pt-3 space-y-2">
                <div className="h-3 skeleton rounded" />
                <div className="h-3 skeleton rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="card text-center py-16 px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand-50 flex items-center justify-center">
            <BookOpen size={30} className="text-brand-500" />
          </div>
          <h3 className="font-serif text-xl font-semibold">Nessun libro trovato</h3>
          <p className="text-sm text-stone-500 mt-1">
            {search
              ? 'Prova con un altro titolo o autore.'
              : 'Aggiungi il tuo primo libro con il pulsante in alto.'}
          </p>
          {search && (
            <button onClick={clearSearch} className="btn-secondary mt-5">
              Mostra tutti i libri
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
          {books.map((book: { id: number }) => (
            <BookCard key={book.id} book={book as any} />
          ))}
        </div>
      )}

      {/* Paginazione */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-12">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary px-3"
            aria-label="Pagina precedente"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-stone-600">
            Pagina <span className="font-semibold text-stone-900">{page}</span> di {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="btn-secondary px-3"
            aria-label="Pagina successiva"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
