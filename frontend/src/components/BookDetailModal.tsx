import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { X, BookOpen, Trash2, FolderInput, Pencil, Save, ImagePlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { deleteBook, updateBook, getSections } from '../api/client'
import { errorMessage } from '../api/errors'
import CoverPicker from './CoverPicker'

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

type EditForm = {
  title: string
  author: string
  year: string
  isbn: string
  publisher: string
  page_count: string
  language: string
  genres: string
  description: string
  cover_url: string
}

function toForm(b: Book): EditForm {
  return {
    title: b.title ?? '',
    author: b.author ?? '',
    year: b.year ? String(b.year) : '',
    isbn: b.isbn ?? '',
    publisher: b.publisher ?? '',
    page_count: b.page_count ? String(b.page_count) : '',
    language: b.language ?? '',
    genres: b.genres ?? '',
    description: b.description ?? '',
    cover_url: b.cover_url ?? '',
  }
}

export default function BookDetailModal({ book, onClose }: Props) {
  const qc = useQueryClient()
  const [movingTo, setMovingTo] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm>(toForm(book))
  const [pickingCover, setPickingCover] = useState(false)

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
    onError: (err) => toast.error(errorMessage(err, 'Errore durante la rimozione')),
  })

  const moveMutation = useMutation({
    mutationFn: (sectionId: number) => updateBook(book.id, { section_id: sectionId }),
    onSuccess: () => {
      toast.success('Libro spostato')
      qc.invalidateQueries({ queryKey: ['books'] })
      setMovingTo(false)
    },
    onError: (err) => toast.error(errorMessage(err, 'Impossibile spostare il libro')),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      updateBook(book.id, {
        title: form.title.trim(),
        author: form.author.trim() || null,
        year: form.year ? Number(form.year) : null,
        isbn: form.isbn.trim() || null,
        publisher: form.publisher.trim() || null,
        page_count: form.page_count ? Number(form.page_count) : null,
        language: form.language.trim() || null,
        genres: form.genres.trim() || null,
        description: form.description.trim() || null,
        cover_url: form.cover_url.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Libro aggiornato')
      qc.invalidateQueries({ queryKey: ['books'] })
      setEditing(false)
    },
    onError: (err) => toast.error(errorMessage(err, 'Errore durante il salvataggio')),
  })

  const genres = (editing ? form.genres : book.genres)
    ? (editing ? form.genres : book.genres!).split(',').map((g) => g.trim()).filter(Boolean)
    : []

  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const cancelEdit = () => {
    setForm(toForm(book))
    setEditing(false)
  }

  const displayCover = editing ? form.cover_url : book.cover_url

  return (
    <div
      className="modal-backdrop z-50"
      onClick={(e) => e.target === e.currentTarget && !editing && onClose()}
    >
      <div className="modal-panel max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h2 className="font-medium text-sm text-stone-500 truncate pr-4">
            {editing ? 'Modifica libro' : 'Dettagli libro'}
          </h2>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="icon-btn hover:text-brand-700 hover:bg-brand-50"
                title="Modifica"
                aria-label="Modifica"
              >
                <Pencil size={17} />
              </button>
            )}
            <button onClick={onClose} className="icon-btn" title="Chiudi" aria-label="Chiudi">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          <div className="flex flex-col sm:flex-row gap-6 p-6">

            {/* Cover */}
            <div className="flex-shrink-0 mx-auto sm:mx-0">
              <div className="w-40 h-60 bg-gradient-to-br from-brand-50 to-stone-100 rounded-xl overflow-hidden shadow-lift ring-1 ring-stone-900/5 relative">
                {displayCover ? (
                  <img
                    src={displayCover}
                    alt={`Copertina di ${book.title}`}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen size={48} className="text-brand-300" />
                  </div>
                )}
              </div>
              {editing && (
                <button
                  onClick={() => setPickingCover(true)}
                  className="btn-secondary text-xs w-40 mt-3 px-2"
                >
                  <ImagePlus size={14} /> Cambia copertina
                </button>
              )}
            </div>

            {/* Info / Form */}
            <div className="flex-1 min-w-0 space-y-4">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="label">Titolo</label>
                    <input className="input text-sm" value={form.title} onChange={set('title')} />
                  </div>
                  <div>
                    <label className="label">Autore</label>
                    <input className="input text-sm" value={form.author} onChange={set('author')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Anno</label>
                      <input className="input text-sm" type="number" value={form.year} onChange={set('year')} />
                    </div>
                    <div>
                      <label className="label">Pagine</label>
                      <input className="input text-sm" type="number" value={form.page_count} onChange={set('page_count')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">ISBN</label>
                      <input className="input text-sm" value={form.isbn} onChange={set('isbn')} />
                    </div>
                    <div>
                      <label className="label">Lingua</label>
                      <input className="input text-sm" value={form.language} onChange={set('language')} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Editore</label>
                    <input className="input text-sm" value={form.publisher} onChange={set('publisher')} />
                  </div>
                  <div>
                    <label className="label">Generi (separati da virgola)</label>
                    <input className="input text-sm" value={form.genres} onChange={set('genres')} />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="font-serif text-2xl font-semibold text-stone-900 leading-tight">{book.title}</h3>
                    {book.author && <p className="text-base text-stone-600 mt-1.5">{book.author}</p>}
                  </div>

                  <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
                    {book.year && (<><dt className="text-stone-400">Anno</dt><dd className="text-stone-800 font-medium">{book.year}</dd></>)}
                    {book.publisher && (<><dt className="text-stone-400">Editore</dt><dd className="text-stone-800 font-medium truncate">{book.publisher}</dd></>)}
                    {book.isbn && (<><dt className="text-stone-400">ISBN</dt><dd className="text-stone-800 font-medium font-mono text-xs">{book.isbn}</dd></>)}
                    {book.page_count && (<><dt className="text-stone-400">Pagine</dt><dd className="text-stone-800 font-medium">{book.page_count}</dd></>)}
                    {book.language && (<><dt className="text-stone-400">Lingua</dt><dd className="text-stone-800 font-medium uppercase">{book.language}</dd></>)}
                    {currentSection && (<><dt className="text-stone-400">Sezione</dt><dd className="text-stone-800 font-medium">{currentSection.name}</dd></>)}
                  </dl>

                  {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g) => (
                        <span key={g} className="badge bg-brand-50 text-brand-700 border border-brand-100">{g}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="px-6 pb-4">
            <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Trama</h4>
            {editing ? (
              <textarea
                className="input text-sm min-h-[120px] resize-y"
                value={form.description}
                onChange={set('description')}
                placeholder="Descrizione del libro…"
              />
            ) : book.description ? (
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{book.description}</p>
            ) : (
              <p className="text-sm text-stone-400 italic">Nessuna trama disponibile.</p>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-stone-100 bg-stone-50/70">
          {editing ? (
            <>
              <button onClick={cancelEdit} className="btn-secondary text-sm">Annulla</button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!form.title.trim() || saveMutation.isPending}
                className="btn-primary text-sm"
              >
                <Save size={15} /> {saveMutation.isPending ? 'Salvataggio…' : 'Salva modifiche'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setMovingTo(true)} className="btn-secondary text-sm">
                <FolderInput size={15} /> Sposta sezione
              </button>
              <button
                onClick={() => confirm(`Rimuovere "${book.title}" dalla libreria?`) && deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200"
              >
                <Trash2 size={15} /> {deleteMutation.isPending ? 'Rimozione…' : 'Rimuovi'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Section picker — bottom sheet */}
      {movingTo && sections && (
        <div
          className="absolute inset-0 z-10 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setMovingTo(false)}
        >
          <div className="absolute inset-0 bg-stone-900/40 rounded-3xl" onClick={() => setMovingTo(false)} />
          <div className="relative z-10 bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-serif text-lg font-semibold">Sposta in sezione</h3>
              <button onClick={() => setMovingTo(false)} className="icon-btn" aria-label="Chiudi">
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
                      isCurrent ? 'bg-brand-50 text-brand-700 cursor-default' : 'hover:bg-stone-50 text-stone-800 active:bg-stone-100'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{s.name}</p>
                      {s.description && <p className="text-xs text-stone-400 truncate">{s.description}</p>}
                    </div>
                    {isCurrent && <span className="text-brand-600 text-xs font-semibold flex-shrink-0">Attuale</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cover picker */}
      {pickingCover && (
        <CoverPicker
          title={form.title || book.title}
          author={form.author || book.author || ''}
          isbn={form.isbn || book.isbn || ''}
          current={form.cover_url}
          onSelect={(url) => { setForm((f) => ({ ...f, cover_url: url })); setPickingCover(false) }}
          onClose={() => setPickingCover(false)}
        />
      )}
    </div>
  )
}
