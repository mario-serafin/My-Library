import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Search, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { getTask, retryTask, confirmTask, dismissTask, getSections } from '../api/client'
import { useAuthStore } from '../store/authStore'
import BookSearchResults, { BookCandidate } from '../components/BookSearchResults'

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeSection } = useAuthStore()
  const taskId = Number(id)

  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [candidates, setCandidates] = useState<BookCandidate[] | null>(null)
  const [selected, setSelected] = useState<BookCandidate | null>(null)
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { data: sections } = useQuery({
    queryKey: ['sections'],
    queryFn: () => getSections().then((r) => r.data),
  })

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTask(taskId).then((r) => r.data),
  })

  useEffect(() => {
    if (task && !initialized) {
      setEditTitle(task.ocr_title ?? '')
      setEditAuthor(task.ocr_author ?? '')
      setSectionId(task.target_section_id ?? activeSection)
      if (task.book_candidates) setCandidates(task.book_candidates)
      setInitialized(true)
    }
  }, [task, initialized])

  const retryMutation = useMutation({
    mutationFn: async () => {
      setRetrying(true)
      const res = await retryTask(taskId, editTitle, editAuthor)
      return res.data
    },
    onSuccess: (data: { candidates: BookCandidate[] }) => {
      setCandidates(data.candidates)
      setSelected(null)
      setRetrying(false)
      qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: () => { toast.error('Search failed'); setRetrying(false) },
  })

  const confirmMutation = useMutation({
    mutationFn: (candidate: BookCandidate) =>
      confirmTask(taskId, {
        ...candidate,
        section_id: sectionId ?? activeSection,
      }),
    onSuccess: () => {
      toast.success('Book added to collection!')
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['pending-count'] })
      navigate('/tasks')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail
      if (msg?.includes('already')) toast.error('Book already in collection')
      else toast.error('Failed to add book')
    },
  })

  const dismissMutation = useMutation({
    mutationFn: () => dismissTask(taskId),
    onSuccess: () => {
      toast.success('Task dismissed')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['pending-count'] })
      navigate('/tasks')
    },
  })

  if (isLoading) return <div className="text-center py-16 text-gray-400">Loading…</div>
  if (!task) return <div className="text-center py-16 text-gray-400">Task not found</div>

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => navigate('/tasks')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} /> Back to tasks
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-4">Review Book</h1>

      {/* Image */}
      {task.image_url && (
        <div className="card overflow-hidden mb-4">
          <img
            src={task.image_url}
            alt="Book cover"
            className="w-full max-h-64 object-contain bg-gray-50"
          />
        </div>
      )}

      {/* Error message */}
      {task.error_message && (
        <div className="card p-3 bg-red-50 border-red-200 mb-4 text-sm text-red-600">
          {task.error_message}
        </div>
      )}

      {/* Edit title/author */}
      <div className="card p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Edit title & author, then search again</h2>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
          <input
            className="input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Book title"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Author</label>
          <input
            className="input"
            value={editAuthor}
            onChange={(e) => setEditAuthor(e.target.value)}
            placeholder="Author name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Section</label>
          <select
            className="input text-sm"
            value={sectionId ?? ''}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Unassigned</option>
            {sections?.map((s: { id: number; name: string }) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => retryMutation.mutate()}
          disabled={!editTitle.trim() || retrying}
          className="btn-primary w-full"
        >
          {retrying ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
          {retrying ? 'Searching…' : 'Search Again'}
        </button>
      </div>

      {/* Candidates */}
      {candidates !== null && (
        <div className="mb-4">
          {selected ? (
            <div className="card p-4 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Confirm this book?</h2>
              <div className="flex gap-3">
                {selected.cover_url && (
                  <img src={selected.cover_url} alt={selected.title} className="w-14 h-20 object-cover rounded" />
                )}
                <div>
                  <p className="font-bold text-gray-900">{selected.title}</p>
                  {selected.author && <p className="text-sm text-gray-600">{selected.author}</p>}
                  {selected.year && <p className="text-xs text-gray-400">{selected.year}</p>}
                  {selected.genres && <p className="text-xs text-blue-500">{selected.genres}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelected(null)} className="btn-secondary flex-1">Back</button>
                <button
                  onClick={() => confirmMutation.mutate(selected)}
                  disabled={confirmMutation.isPending}
                  className="btn-primary flex-1"
                >
                  <CheckCircle size={16} />
                  {confirmMutation.isPending ? 'Adding…' : 'Confirm'}
                </button>
              </div>
            </div>
          ) : (
            <BookSearchResults
              candidates={candidates}
              onSelect={setSelected}
              loading={retrying}
            />
          )}
        </div>
      )}

      {/* Dismiss */}
      <button
        onClick={() => dismissMutation.mutate()}
        disabled={dismissMutation.isPending}
        className="btn-secondary w-full text-gray-400"
      >
        <XCircle size={16} />
        {dismissMutation.isPending ? 'Dismissing…' : 'Dismiss this task'}
      </button>
    </div>
  )
}
