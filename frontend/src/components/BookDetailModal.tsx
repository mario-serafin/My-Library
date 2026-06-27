import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { X, BookOpen, Trash2, FolderInput } from 'lucide-react'
import toast from 'react-hot-toast'
import { deleteBook, updateBook, getSections } from '../api/client'

interface Book {
  id: number
  title: string
  author?: string
  year?: number
  isbn?: string
  cover_url?: string
  genres?: string
  publisher?: string
  page_count?: number
  language?: string
  description?: string
  section_id?: number
  open_library_id?: string
}

interface Props {
  book: Book
  onClose: () => void
}

export default function BookDetailModal({ book, onClose }: Props) {
  const qc = useQueryClient()
  const [movingTo, setMovingTo] = useState(false)

  const { data: sections } = useQuery({
    queryKey: ['sections'],
    queryFn: () => getSections().then((r) => r.data),
    staleTime: 60_000,
  })

  const currentSection = sections?.find((s: { id: number }) => s.id === book.section_id)

  const deleteMutation = useMutation({
    mutationFn: () => deleteBook(book.id),
    onSuccess: () => {
      toast.success('Libro rimosso dalla libreria')
      qc.invalidateQueries({ queryKey: ['books'] })
      onClose()
    },
    onError: () => toast.error('Errore durante la rimozione'),
  })

  const moveMutation = useMutation({
    mutationFn: (sectionId: number) => updateBook(book.id, { section_id: sectionId }),
    onSuccess: () => {
      toast.success('Libro spostato')
      qc.invalidateQueries({ queryKey: ['books'] })
      setMovingTo(false)
    },
  })

  const genres = book.genres ? book.genres.split(',').map((g) => g.trim()).filter(Boolean) : []

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 truncate pr-4">{book.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          <div className="flex flex-col sm:flex-row gap-6 p-6">

            {/* Cover */}
            <div className="flex-shrink-0 mx-auto sm:mx-0">
              <div className="w-36 h-52 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl overflow-hidden shadow-md">
                {book.cover_url ? (
                  <img
                    src={book.cover_url}
                    alt={book.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen size={48} className="text-blue-300" />
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* Title + Author */}
              <div>
                <h3 className="text-xl font-bold text-gray-900 leading-tight">{book.title}</h3>
                {book.author && (
                  <p className="text-base text-gray-600 mt-1">{book.author}</p>
                )}
              </div>

              {/* Metadata grid */}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {book.year && (
                  <>
                    <dt className="text-gray-400">Anno</dt>
                    <dd className="text-gray-800 font-medium">{book.year}</dd>
                  </>
                )}
                {book.publisher && (
                  <>
                    <dt className="text-gray-400">Editore</dt>
                    <dd className="text-gray-800 font-medium truncate">{book.publisher}</dd>
                  </>
                )}
                {book.isbn && (
                  <>
                    <dt className="text-gray-400">ISBN</dt>
                    <dd className="text-gray-800 font-medium font-mono text-xs">{book.isbn}</dd>
                  </>
                )}
                {book.page_count && (
                  <>
                    <dt className="text-gray-400">Pagine</dt>
                    <dd className="text-gray-800 font-medium">{book.page_count}</dd>
                  </>
                )}
                {book.language && (
                  <>
                    <dt className="text-gray-400">Lingua</dt>
                    <dd className="text-gray-800 font-medium uppercase">{book.language}</dd>
                  </>
                )}
                {currentSection && (
                  <>
                    <dt className="text-gray-400">Sezione</dt>
                    <dd className="text-gray-800 font-medium">{currentSection.name}</dd>
                  </>
                )}
              </dl>

              {/* Genres */}
              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {genres.map((g) => (
                    <span key={g} className="badge bg-blue-50 text-blue-700 border border-blue-100">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {book.description && (
            <div className="px-6 pb-4">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Trama</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{book.description}</p>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setMovingTo(true)}
            className="btn-secondary text-sm"
          >
            <FolderInput size={15} /> Sposta sezione
          </button>
          <button
            onClick={() => confirm(`Rimuovere "${book.title}" dalla libreria?`) && deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="btn-danger text-sm"
          >
            <Trash2 size={15} />
            {deleteMutation.isPending ? 'Rimozione…' : 'Rimuovi'}
          </button>
        </div>
      </div>

      {/* Section picker — bottom sheet */}
      {movingTo && sections && (
        <div
          className="absolute inset-0 z-10 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setMovingTo(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 rounded-2xl" onClick={() => setMovingTo(false)} />

          {/* Sheet */}
          <div className="relative z-10 bg-white w-full sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Sposta in sezione</h3>
              <button onClick={() => setMovingTo(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              {(sections as { id: number; name: string; description?: string }[]).map((s) => {
                const isCurrent = s.id === book.section_id
                return (
                  <button
                    key={s.id}
                    onClick={() => { if (!isCurrent) moveMutation.mutate(s.id) }}
                    disabled={isCurrent || moveMutation.isPending}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-colors ${
                      isCurrent
                        ? 'bg-blue-50 text-blue-700 cursor-default'
                        : 'hover:bg-gray-50 text-gray-800 active:bg-gray-100'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{s.name}</p>
                      {s.description && <p className="text-xs text-gray-400 truncate">{s.description}</p>}
                    </div>
                    {isCurrent && <span className="text-blue-500 text-xs font-semibold flex-shrink-0">Attuale</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
