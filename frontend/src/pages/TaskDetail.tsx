import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Search, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { getTask, retryTask, confirmTask, dismissTask } from '../api/client'
import BookSearchResults, { BookCandidate } from '../components/BookSearchResults'

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const taskId = Number(id)

  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [candidates, setCandidates] = useState<BookCandidate[] | null>(null)
  const [selected, setSelected] = useState<BookCandidate | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTask(taskId).then((r) => r.data),
  })

  useEffect(() => {
    if (task && !initialized) {
      setEditTitle(task.ocr_title ?? '')
      setEditAuthor(task.ocr_author ?? '')
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
    onError: () => { toast.error('Ricerca fallita'); setRetrying(false) },
  })

  const confirmMutation = useMutation({
    mutationFn: (candidate: BookCandidate) => confirmTask(taskId, { ...candidate }),
    onSuccess: () => {
      toast.success('Libro aggiunto nella sezione corretta!')
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['pending-count'] })
      navigate('/tasks')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail
      if (msg?.includes('already')) toast.error('Libro già presente nella collezione')
      else toast.error('Errore durante l\'aggiunta')
    },
  })

  const dismissMutation = useMutation({
    mutationFn: () => dismissTask(taskId),
    onSuccess: () => {
      toast.success('Task ignorato')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['pending-count'] })
      navigate('/tasks')
    },
  })

  if (isLoading) return <div className="text-center py-16 text-gray-400">Caricamento…</div>
  if (!task) return <div className="text-center py-16 text-gray-400">Task non trovato</div>

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => navigate('/tasks')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} /> Torna ai task
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Revisiona libro</h1>
      <p className="text-sm text-gray-500 mb-4">La sezione sarà assegnata automaticamente in base al genere.</p>

      {/* Image */}
      {task.image_url && (
        <div className="card overflow-hidden mb-4">
          <img src={task.image_url} alt="Copertina" className="w-full max-h-64 object-contain bg-gray-50" />
        </div>
      )}

      {/* Error */}
      {task.error_message && (
        <div className="card p-3 bg-red-50 border-red-200 mb-4 text-sm text-red-600">
          {task.error_message}
        </div>
      )}

      {/* Edit title/author */}
      <div className="card p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Correggi titolo e autore se necessario</h2>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Titolo</label>
          <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Titolo del libro" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Autore</label>
          <input className="input" value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)} placeholder="Nome autore" />
        </div>
        <button
          onClick={() => retryMutation.mutate()}
          disabled={!editTitle.trim() || retrying}
          className="btn-primary w-full"
        >
          {retrying ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
          {retrying ? 'Ricerca…' : 'Cerca di nuovo'}
        </button>
      </div>

      {/* Candidates */}
      {candidates !== null && (
        <div className="mb-4">
          {selected ? (
            <div className="card p-4 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Confermi questo libro?</h2>
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
              <p className="text-xs text-gray-400">La sezione verrà assegnata automaticamente in base al genere.</p>
              <div className="flex gap-2">
                <button onClick={() => setSelected(null)} className="btn-secondary flex-1">Indietro</button>
                <button
                  onClick={() => confirmMutation.mutate(selected)}
                  disabled={confirmMutation.isPending}
                  className="btn-primary flex-1"
                >
                  <CheckCircle size={16} />
                  {confirmMutation.isPending ? 'Aggiunta…' : 'Conferma'}
                </button>
              </div>
            </div>
          ) : (
            <BookSearchResults candidates={candidates} onSelect={setSelected} loading={retrying} />
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
        {dismissMutation.isPending ? 'Ignorando…' : 'Ignora questo task'}
      </button>
    </div>
  )
}
