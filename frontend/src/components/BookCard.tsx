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
  const [broken, setBroken] = useState(false)
  const showCover = book.cover_url && !broken

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex flex-col text-left focus:outline-none"
      >
        {/* Copertina */}
        <div className="aspect-[2/3] w-full rounded-xl overflow-hidden relative bg-gradient-to-br from-brand-50 to-stone-100 ring-1 ring-stone-900/5 shadow-soft transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lift group-focus-visible:ring-2 group-focus-visible:ring-brand-500">
          {showCover ? (
            <img
              src={book.cover_url}
              alt={`Copertina di ${book.title}`}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
              <BookOpen size={32} className="text-brand-300" />
              <span className="font-serif text-sm text-brand-800/70 line-clamp-3">{book.title}</span>
            </div>
          )}
          {/* Riflesso sul dorso, effetto libro */}
          <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/15 to-transparent pointer-events-none" />
        </div>

        {/* Informazioni */}
        <div className="pt-3 flex flex-col gap-0.5">
          <h3 className="font-semibold text-stone-900 text-sm leading-snug line-clamp-2 group-hover:text-brand-700 transition-colors">
            {book.title}
          </h3>
          {book.author && <p className="text-xs text-stone-500 line-clamp-1">{book.author}</p>}
          {book.year && <p className="text-xs text-stone-400">{book.year}</p>}
        </div>
      </button>

      {open && <BookDetailModal book={book} onClose={() => setOpen(false)} />}
    </>
  )
}
