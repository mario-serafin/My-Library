import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, AlertCircle, CheckCircle, XCircle, Loader, Image, Trash2, RefreshCw, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { getTasks, deleteTask, deleteAllDismissed, reprocessTask } from '../api/client'
import { errorMessage } from '../api/errors'

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:          { label: 'In attesa',    color: 'bg-stone-100 text-stone-600',  icon: <Clock size={13} /> },
  processing:       { label: 'Elaborazione', color: 'bg-sky-100 text-sky-700',      icon: <Loader size={13} className="animate-spin" /> },
  completed:        { label: 'Completato',   color: 'bg-brand-100 text-brand-700',  icon: <CheckCircle size={13} /> },
  needs_attention:  { label: 'Da revisionare', color: 'bg-amber-100 text-amber-800', icon: <AlertCircle size={13} /> },
  dismissed:        { label: 'Ignorato',     color: 'bg-stone-100 text-stone-500',  icon: <XCircle size={13} /> },
  failed:           { label: 'Fallito',      color: 'bg-red-100 text-red-700',      icon: <XCircle size={13} /> },
}

interface Task {
  id: number
  status: string
  ocr_title?: string
  ocr_author?: string
  image_url?: string
  error_message?: string
  recovered?: boolean
  created_at: string
}

export default function Tasks() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', page, filter],
    queryFn: () => getTasks({ page, page_size: 20, status: filter || undefined }).then((r) => r.data),
    refetchInterval: (query) => {
      const hasPending = (query.state.data as { items?: Task[] } | undefined)?.items?.some(
        (t) => t.status === 'pending' || t.status === 'processing'
      )
      return hasPending ? 5000 : 15000
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: () => {
      toast.success('Task eliminato')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err) => toast.error(errorMessage(err, 'Errore durante l\'eliminazione')),
  })

  const clearDismissedMutation = useMutation({
    mutationFn: () => deleteAllDismissed(),
    onSuccess: () => {
      toast.success('Task ignorati eliminati')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err) => toast.error(errorMessage(err, 'Errore durante l\'eliminazione')),
  })

  const reprocessMutation = useMutation({
    mutationFn: (id: number) => reprocessTask(id),
    onSuccess: () => {
      toast.success('Rielaborazione avviata')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['pending-count'] })
    },
    onError: (err) => toast.error(errorMessage(err, 'Impossibile riavviare la rielaborazione')),
  })

  const tasks: Task[] = data?.items ?? []
  const hasDismissed = tasks.some((t) => t.status === 'dismissed')

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">Task di elaborazione</h1>
          <p className="page-subtitle">Le foto caricate e il loro stato di riconoscimento.</p>
        </div>
        {(filter === 'dismissed' || hasDismissed) && (
          <button
            onClick={() => clearDismissedMutation.mutate()}
            disabled={clearDismissedMutation.isPending}
            className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200"
          >
            <Trash2 size={14} /> Elimina tutti gli ignorati
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {['', 'needs_attention', 'pending', 'processing', 'completed', 'dismissed'].map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setPage(1) }}
            className={filter === s ? 'chip-on' : 'chip-off'}
          >
            {s === '' ? 'Tutti' : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 flex gap-4">
              <div className="w-12 h-16 skeleton rounded-md" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 skeleton rounded w-1/2" />
                <div className="h-3 skeleton rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="card text-center py-16 px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand-50 flex items-center justify-center">
            <Clock size={30} className="text-brand-500" />
          </div>
          <h3 className="font-serif text-xl font-semibold">Nessun task</h3>
          <p className="text-sm text-stone-400 mt-1">I task vengono creati quando carichi le foto dei libri.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const meta = STATUS_META[task.status] ?? STATUS_META.pending
            const isActionable = task.status === 'needs_attention' || task.status === 'failed'
            const isDismissed = task.status === 'dismissed'
            const canReprocess =
              !!task.image_url &&
              ['pending', 'failed'].includes(task.status)

            return (
              <div
                key={task.id}
                onClick={() => isActionable && navigate(`/tasks/${task.id}`)}
                className={`card p-4 flex gap-4 ${isActionable ? 'cursor-pointer hover:border-brand-300 hover:shadow-lift' : ''} ${task.recovered ? 'border-violet-200' : ''} transition-all`}
              >
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-12 h-16 bg-stone-100 rounded-md overflow-hidden ring-1 ring-stone-900/5">
                  {task.image_url ? (
                    <img src={task.image_url} alt="Foto caricata" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image size={20} className="text-stone-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-stone-900 text-sm truncate">
                        {task.ocr_title || '(nessun titolo estratto)'}
                      </p>
                      {task.ocr_author && (
                        <p className="text-xs text-stone-500 truncate">{task.ocr_author}</p>
                      )}
                      {task.error_message && (
                        <p className="text-xs text-amber-700 mt-1 line-clamp-2">{task.error_message}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:flex-shrink-0">
                      {task.recovered && (
                        <span className="badge bg-violet-100 text-violet-700 flex items-center gap-1 whitespace-nowrap">
                          <RotateCcw size={13} /> Recuperato
                        </span>
                      )}
                      <span className={`badge ${meta.color} flex items-center gap-1 whitespace-nowrap`}>
                        {meta.icon} {meta.label}
                      </span>
                      {isDismissed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteMutation.mutate(task.id)
                          }}
                          disabled={deleteMutation.isPending}
                          className="icon-btn p-1 hover:text-red-600 hover:bg-red-50"
                          title="Elimina task"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-stone-400">
                      {new Date(task.created_at).toLocaleDateString('it-IT')} {new Date(task.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="flex items-center gap-3">
                      {canReprocess && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            reprocessMutation.mutate(task.id)
                          }}
                          disabled={reprocessMutation.isPending}
                          className="text-xs text-brand-700 font-medium flex items-center gap-1 hover:text-brand-900"
                          title="Riprova con l'AI"
                        >
                          <RefreshCw size={12} className={reprocessMutation.isPending ? 'animate-spin' : ''} />
                          Riprova
                        </button>
                      )}
                      {isActionable && (
                        <span className="text-xs text-brand-700 font-medium">Revisiona →</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {(data?.pages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3" aria-label="Pagina precedente">←</button>
          <span className="text-sm text-stone-600">Pagina {page} di {data?.pages}</span>
          <button onClick={() => setPage((p) => Math.min(data?.pages ?? 1, p + 1))} disabled={page === (data?.pages ?? 1)} className="btn-secondary px-3" aria-label="Pagina successiva">→</button>
        </div>
      )}
    </div>
  )
}
