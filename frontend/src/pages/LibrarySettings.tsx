import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Check, X, Lock, Trash } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSections, createSection, updateSection, deleteSection, clearSection } from '../api/client'

interface Section {
  id: number
  name: string
  description?: string
  genres?: string
  is_system: boolean
}

const CONFIRM_WORD = 'SVUOTA'

function ClearSectionModal({
  section,
  onConfirm,
  onCancel,
  isPending,
}: {
  section: Section
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const [typed, setTyped] = useState('')

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Trash size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Svuota sezione</h2>
            <p className="text-sm text-gray-500">{section.name}</p>
          </div>
        </div>

        <p className="text-sm text-gray-700 mb-2">
          Questa operazione elimina <strong>tutti i libri</strong> contenuti nella sezione
          <strong> "{section.name}"</strong> in modo permanente.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Digita <span className="font-mono font-bold text-red-600">{CONFIRM_WORD}</span> per confermare:
        </p>

        <input
          className="input mb-4 font-mono tracking-widest text-center uppercase"
          placeholder={CONFIRM_WORD}
          value={typed}
          onChange={(e) => setTyped(e.target.value.toUpperCase())}
          autoFocus
        />

        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">
            Annulla
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== CONFIRM_WORD || isPending}
            className="btn-danger flex-1"
          >
            {isPending ? 'Eliminazione…' : 'Svuota sezione'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LibrarySettings() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newGenres, setNewGenres] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editGenres, setEditGenres] = useState('')
  const [clearTarget, setClearTarget] = useState<Section | null>(null)

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['sections'],
    queryFn: () => getSections().then((r) => r.data),
  })

  const systemSections: Section[] = (sections as Section[]).filter((s) => s.is_system)
  const customSections: Section[] = (sections as Section[]).filter((s) => !s.is_system)

  const createMutation = useMutation({
    mutationFn: () => createSection({ name: newName, description: newDesc, genres: newGenres }),
    onSuccess: () => {
      toast.success('Sezione creata')
      qc.invalidateQueries({ queryKey: ['sections'] })
      setNewName(''); setNewDesc(''); setNewGenres('')
    },
    onError: () => toast.error('Errore durante la creazione'),
  })

  const updateMutation = useMutation({
    mutationFn: (id: number) => updateSection(id, { name: editName, description: editDesc, genres: editGenres }),
    onSuccess: () => {
      toast.success('Sezione aggiornata')
      qc.invalidateQueries({ queryKey: ['sections'] })
      setEditId(null)
    },
    onError: () => toast.error('Errore durante l\'aggiornamento'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSection(id),
    onSuccess: () => {
      toast.success('Sezione eliminata')
      qc.invalidateQueries({ queryKey: ['sections'] })
    },
    onError: () => toast.error('Impossibile eliminare la sezione'),
  })

  const clearMutation = useMutation({
    mutationFn: (id: number) => clearSection(id),
    onSuccess: (res) => {
      const count = res.data.deleted
      toast.success(`${count} libr${count === 1 ? 'o eliminato' : 'i eliminati'} dalla sezione`)
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['sections'] })
      setClearTarget(null)
    },
    onError: () => toast.error('Errore durante lo svuotamento'),
  })

  const startEdit = (s: Section) => {
    setEditId(s.id); setEditName(s.name)
    setEditDesc(s.description ?? ''); setEditGenres(s.genres ?? '')
  }

  const SectionRow = ({ s, showClear }: { s: Section; showClear?: boolean }) => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {editId === s.id ? (
        <div className="p-3 space-y-2">
          <input className="input text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome sezione" />
          <input className="input text-sm" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descrizione (opzionale)" />
          <input className="input text-sm" value={editGenres} onChange={(e) => setEditGenres(e.target.value)} placeholder="Generi (opzionale)" />
          <div className="flex gap-2">
            <button onClick={() => updateMutation.mutate(s.id)} disabled={!editName.trim()} className="btn-primary flex-1 py-1.5 text-sm">
              <Check size={14} /> Salva
            </button>
            <button onClick={() => setEditId(null)} className="btn-secondary flex-1 py-1.5 text-sm">
              <X size={14} /> Annulla
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 text-sm">{s.name}</p>
            {s.description && <p className="text-xs text-gray-500 truncate">{s.description}</p>}
          </div>
          <div className="flex gap-1">
            {showClear && (
              <button
                onClick={() => setClearTarget(s)}
                className="p-1.5 text-gray-400 hover:text-orange-600 rounded hover:bg-orange-50"
                title="Svuota sezione"
              >
                <Trash size={15} />
              </button>
            )}
            {!s.is_system && (
              <>
                <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={() => confirm(`Eliminare la sezione "${s.name}"?`) && deleteMutation.mutate(s.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Impostazioni Libreria</h1>

      {/* System sections */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={15} className="text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-800">Sezioni fisse</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Assegnate automaticamente in base ai generi. Non modificabili.
          Il pulsante <Trash size={12} className="inline text-orange-500 mx-0.5" /> svuota tutti i libri della sezione.
        </p>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-1.5">
            {systemSections.map((s) => (
              <SectionRow key={s.id} s={s} showClear />
            ))}
          </div>
        )}
      </div>

      {/* Custom sections */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Sezioni personalizzate</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sezioni aggiuntive create manualmente.
        </p>

        {!isLoading && customSections.length === 0 && (
          <p className="text-sm text-gray-400 italic mb-4">Nessuna sezione personalizzata ancora.</p>
        )}

        {customSections.length > 0 && (
          <div className="space-y-2 mb-6">
            {customSections.map((s) => (
              <SectionRow key={s.id} s={s} showClear />
            ))}
          </div>
        )}

        {/* Create */}
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }} className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Plus size={15} /> Nuova sezione
          </h3>
          <input className="input text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome *" />
          <input className="input text-sm" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descrizione (opzionale)" />
          <input className="input text-sm" value={newGenres} onChange={(e) => setNewGenres(e.target.value)} placeholder="Generi (opzionale)" />
          <button type="submit" disabled={!newName.trim() || createMutation.isPending} className="btn-primary">
            <Plus size={16} /> Crea sezione
          </button>
        </form>
      </div>

      {/* Confirmation modal */}
      {clearTarget && (
        <ClearSectionModal
          section={clearTarget}
          onConfirm={() => clearMutation.mutate(clearTarget.id)}
          onCancel={() => setClearTarget(null)}
          isPending={clearMutation.isPending}
        />
      )}
    </div>
  )
}
