import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import BookDetailModal from './BookDetailModal'

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
  language?: string
  description?: string
  open_library_id?: string
}

interface Props {
  book: Book
}

export default function BookCard({ book }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="card flex flex-col overflow-hidden hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
      >
        {/* Cover */}
        <div className="aspect-[2/3] bg-gradient-to-br from-blue-50 to-indigo-100 relative overflow-hidden">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen size={40} className="text-blue-300" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col gap-0.5">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{book.title}</h3>
          {book.author && <p className="text-xs text-gray-500 line-clamp-1">{book.author}</p>}
          {book.year && <p className="text-xs text-gray-400">{book.year}</p>}
        </div>
      </div>

      {open && <BookDetailModal book={book} onClose={() => setOpen(false)} />}
    </>
  )
}
