import { useState, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Upload, Search, CheckCircle, ArrowRight, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { searchBooks, createBook, uploadImage, getSections } from '../api/client'
import { useAuthStore } from '../store/authStore'
import BookSearchResults, { BookCandidate } from '../components/BookSearchResults'

type Tab = 'photo' | 'search'

function isMobile() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
}

export default function AddBook() {
  const qc = useQueryClient()
  const { activeSection, user } = useAuthStore()
  const [tab, setTab] = useState<Tab>(isMobile() ? 'photo' : 'search')

  // Photo tab
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)

  // Search tab
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [candidates, setCandidates] = useState<BookCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<BookCandidate | null>(null)
  const [sectionId, setSectionId] = useState<number | null>(activeSection)
  const [justAdded, setJustAdded] = useState(false)

  const { data: sections } = useQuery({
    queryKey: ['sections'],
    queryFn: () => getSections().then((r) => r.data),
  })

  const addBookMutation = useMutation({
    mutationFn: (candidate: BookCandidate) =>
      createBook({ ...candidate, section_id: sectionId ?? activeSection ?? user?.default_section_id }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success(`"${res.data.title}" added!`)
      setSelected(null)
      setCandidates([])
      setTitle('')
      setAuthor('')
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 4000)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail
      if (msg?.includes('already')) toast.error('This book is already in the collection')
      else toast.error('Failed to add book')
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
    setUploadDone(false)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    try {
      await uploadImage(selectedFile, sectionId ?? activeSection ?? undefined)
      setUploadDone(true)
      setPreview(null)
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
      qc.invalidateQueries({ queryKey: ['pending-count'] })
      toast.success('Photo queued for processing!')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSearching(true)
    setSelected(null)
    try {
      const res = await searchBooks(title, author)
      setCandidates(res.data)
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  const resetSearch = () => {
    setSelected(null)
    setCandidates([])
    setTitle('')
    setAuthor('')
  }

  const tabClass = (t: Tab) =>
    `flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add a Book</h1>

      {/* Section selector */}
      <div className="card p-3 mb-4 flex items-center gap-3">
        <span className="text-sm text-gray-500 flex-shrink-0">Add to:</span>
        <select
          className="input flex-1 text-sm py-1"
          value={sectionId ?? ''}
          onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Unassigned</option>
          {sections?.map((s: { id: number; name: string }) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
        <button className={tabClass('photo')} onClick={() => setTab('photo')}>
          <Camera size={16} className="inline mr-1.5" />
          {isMobile() ? 'Camera / Photo' : 'Upload Photo'}
        </button>
        <button className={tabClass('search')} onClick={() => setTab('search')}>
          <Search size={16} className="inline mr-1.5" />
          Search by Title
        </button>
      </div>

      {/* --- PHOTO TAB --- */}
      {tab === 'photo' && (
        <div className="space-y-4">
          {uploadDone ? (
            <div className="card p-8 text-center">
              <CheckCircle size={48} className="mx-auto text-green-500 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">Photo queued!</h3>
              <p className="text-sm text-gray-500 mb-4">
                The book will be identified automatically. Check the Tasks page for results.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setUploadDone(false)}
                  className="btn-primary"
                >
                  <Camera size={16} /> Add another photo
                </button>
              </div>
            </div>
          ) : preview ? (
            <div className="card overflow-hidden">
              <img src={preview} alt="Preview" className="w-full max-h-72 object-contain bg-gray-50" />
              <div className="p-4 flex gap-2">
                <button
                  onClick={() => { setPreview(null); setSelectedFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="btn-secondary flex-1"
                >
                  Retake
                </button>
                <button onClick={handleUpload} disabled={uploading} className="btn-primary flex-1">
                  {uploading ? 'Uploading…' : 'Process Photo'}
                  {!uploading && <ArrowRight size={16} />}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileRef.current?.click()}
              className="card border-2 border-dashed border-gray-300 p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              {isMobile() ? (
                <Camera size={48} className="text-gray-300 mb-4" />
              ) : (
                <Upload size={48} className="text-gray-300 mb-4" />
              )}
              <p className="font-medium text-gray-600">
                {isMobile() ? 'Take a photo of the book cover' : 'Upload a book cover photo'}
              </p>
              <p className="text-sm text-gray-400 mt-1">JPG, PNG up to 20MB</p>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture={isMobile() ? 'environment' : undefined}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* --- SEARCH TAB --- */}
      {tab === 'search' && (
        <div className="space-y-4">
          {justAdded && (
            <div className="card p-4 bg-green-50 border-green-200 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800">Book added successfully!</p>
                <p className="text-sm text-green-600">Search for the next one below.</p>
              </div>
            </div>
          )}

          {selected ? (
            /* Confirm selected book */
            <div className="space-y-4">
              <div className="card p-4 flex gap-4">
                <div className="flex-shrink-0 w-16 h-22 bg-gray-100 rounded overflow-hidden">
                  {selected.cover_url ? (
                    <img src={selected.cover_url} alt={selected.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen size={24} className="text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900">{selected.title}</h3>
                  {selected.author && <p className="text-sm text-gray-600">{selected.author}</p>}
                  {selected.year && <p className="text-xs text-gray-400">{selected.year}</p>}
                  {selected.publisher && <p className="text-xs text-gray-400">{selected.publisher}</p>}
                  {selected.genres && <p className="text-xs text-blue-500">{selected.genres}</p>}
                  {selected.isbn && <p className="text-xs text-gray-400">ISBN: {selected.isbn}</p>}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setSelected(null)} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  onClick={() => addBookMutation.mutate(selected)}
                  disabled={addBookMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {addBookMutation.isPending ? 'Adding…' : 'Confirm & Add'}
                  {!addBookMutation.isPending && <CheckCircle size={16} />}
                </button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleSearch} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    className="input"
                    placeholder="e.g. The Name of the Rose"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                  <input
                    className="input"
                    placeholder="e.g. Umberto Eco"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={!title.trim() || searching} className="btn-primary w-full">
                  {searching ? 'Searching…' : 'Search'}
                  {!searching && <Search size={16} />}
                </button>
              </form>

              {(candidates.length > 0 || searching) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-700">
                      {candidates.length} result{candidates.length !== 1 ? 's' : ''}
                    </h3>
                    {candidates.length > 0 && (
                      <button onClick={resetSearch} className="text-xs text-gray-400 hover:text-gray-600">
                        Clear
                      </button>
                    )}
                  </div>
                  <BookSearchResults
                    candidates={candidates}
                    onSelect={setSelected}
                    loading={searching}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
