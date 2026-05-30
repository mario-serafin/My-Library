import { useState } from 'react'
import { BookOpen, Trash2, Edit2, ChevronDown, ChevronUp } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { deleteBook, updateBook, getSections } from '../api/client'

interface Book {
  id: number
  title: string
  author?: string
  year?: number
  cover_url?: string
  genres?: string
  section_id?: number
  isbn?: string
  publisher?: string
  page_count?: number
  description?: string
}

interface Props {
  book: Book
}

export default function BookCard({ book }: Props) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [moving, setMoving] = useState(false)

  const { data: sections } = useQuery({
    queryKey: ['sections'],
    queryFn: () => getSections().then((r) => r.data),
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteBook(book.id),
    onSuccess: () => {
      toast.success('Book removed')
      qc.invalidateQueries({ queryKey: ['books'] })
    },
    onError: () => toast.error('Failed to remove book'),
  })

  const moveMutation = useMutation({
    mutationFn: (sectionId: number) => updateBook(book.id, { section_id: sectionId }),
    onSuccess: () => {
      toast.success('Book moved')
      qc.invalidateQueries({ queryKey: ['books'] })
      setMoving(false)
    },
  })

  const handleDelete = () => {
    if (confirm(`Remove "${book.title}" from the library?`)) deleteMutation.mutate()
  }

  return (
    <div className="card flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      {/* Cover */}
      <div className="aspect-[2/3] bg-gradient-to-br from-blue-50 to-indigo-100 relative overflow-hidden">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen size={40} className="text-blue-300" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{book.title}</h3>
        {book.author && <p className="text-xs text-gray-500 line-clamp-1">{book.author}</p>}
        {book.year && <p className="text-xs text-gray-400">{book.year}</p>}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Less' : 'More'}
        </button>

        {expanded && (
          <div className="mt-1 space-y-1 text-xs text-gray-500 border-t border-gray-100 pt-2">
            {book.isbn && <p>ISBN: {book.isbn}</p>}
            {book.publisher && <p>Publisher: {book.publisher}</p>}
            {book.page_count && <p>{book.page_count} pages</p>}
            {book.genres && <p className="text-blue-500">{book.genres}</p>}
            {book.description && (
              <p className="line-clamp-3 text-gray-400 italic">{book.description}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto pt-2 flex gap-2">
          <button
            onClick={() => setMoving(!moving)}
            className="flex-1 text-xs btn-secondary py-1"
            title="Move to section"
          >
            <Edit2 size={12} /> Move
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="text-xs btn-danger py-1 px-2"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {moving && sections && (
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-xs text-gray-400">Move to:</p>
            {sections.map((s: { id: number; name: string }) => (
              <button
                key={s.id}
                onClick={() => moveMutation.mutate(s.id)}
                disabled={s.id === book.section_id}
                className={`text-xs text-left px-2 py-1 rounded hover:bg-blue-50 ${
                  s.id === book.section_id ? 'text-blue-600 font-medium' : 'text-gray-600'
                }`}
              >
                {s.id === book.section_id ? '✓ ' : ''}{s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
