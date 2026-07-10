import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, AlertCircle, CheckCircle, XCircle, Loader, Image, Trash2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { getTasks, deleteTask, deleteAllDismissed, reprocessTask } from '../api/client'

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:          { label: 'In attesa',        color: 'bg-yellow-100 text-yellow-700', icon: <Clock size={13} /> },
  processing:       { label: 'Elaborazione',     color: 'bg-blue-100 text-blue-700',    icon: <Loader size={13} className="animate-spin" /> },
  completed:        { label: 'Completato',        color: 'bg-green-100 text-green-700',  icon: <CheckCircle size={13} /> },
  needs_attention:  { label: 'Revisione',         color: 'bg-red-100 text-red-700',      icon: <AlertCircle size={13} /> },
  dismissed:        { label: 'Ignorato',          color: 'bg-gray-100 text-gray-500',    icon: <XCircle size={13} /> },
  failed:           { label: 'Fallito',           color: 'bg-red-100 text-red-700',      icon: <XCircle size={13} /> },
}

interface Task {
  id: number
  status: string
  ocr_title?: string
  ocr_author?: string
  image_url?: string
  error_message?: string
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
    onError: () => toast.error('Errore durante l\'eliminazione'),
  })

  const clearDismissedMutation = useMutation({
    mutationFn: () => deleteAllDismissed(),
    onSuccess: () => {
      toast.success('Task ignorati eliminati')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const reprocessMutation = useMutation({
    mutationFn: (id: number) => reprocessTask(id),
    onSuccess: () => {
      toast.success('Rielaborazione avviata')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['pending-count'] })
    },
    onError: () => toast.error('Impossibile riavviare la rielaborazione'),
  })

  const tasks: Task[] = data?.items ?? []
  const hasDismissed = tasks.some((t) => t.status === 'dismissed')

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Task di elaborazione</h1>
        {(filter === 'dismissed' || hasDismissed) && (
          <button
            onClick={() => clearDismissedMutation.mutate()}
            disabled={clearDismissedMutation.isPending}
            className="btn-secondary text-sm text-red-500 border-red-200 hover:bg-red-50"
          >
            <Trash2 size={14} /> Elimina tutti gli ignorati
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap mb-4">
        {['', 'needs_attention', 'pending', 'processing', 'completed', 'dismissed'].map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === '' ? 'Tutti' : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 animate-pulse flex gap-4">
              <div className="w-12 h-16 bg-gray-200 rounded" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <Clock size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500">Nessun task</h3>
          <p className="text-sm text-gray-400 mt-1">I task vengono creati quando carichi le foto dei libri.</p>
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
                className={`card p-4 flex gap-4 ${isActionable ? 'cursor-pointer hover:border-blue-300 hover:shadow' : ''} transition-all`}
              >
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-12 h-16 bg-gray-100 rounded overflow-hidden">
                  {task.image_url ? (
                    <img src={task.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image size={20} className="text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {task.ocr_title || '(nessun titolo estratto)'}
                      </p>
                      {task.ocr_author && (
                        <p className="text-xs text-gray-500 truncate">{task.ocr_author}</p>
                      )}
                      {task.error_message && (
                        <p className="text-xs text-orange-400 mt-0.5 line-clamp-2">{task.error_message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Elimina task"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-400">
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
                          className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:text-blue-800"
                          title="Riprova con l'AI"
                        >
                          <RefreshCw size={12} className={reprocessMutation.isPending ? 'animate-spin' : ''} />
                          Riprova
                        </button>
                      )}
                      {isActionable && (
                        <span className="text-xs text-gray-400 font-medium">Revisiona →</span>
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
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3 py-2">←</button>
          <span className="text-sm text-gray-600">Pagina {page} di {data?.pages}</span>
          <button onClick={() => setPage((p) => Math.min(data?.pages ?? 1, p + 1))} disabled={page === (data?.pages ?? 1)} className="btn-secondary px-3 py-2">→</button>
        </div>
      )}
    </div>
  )
}
