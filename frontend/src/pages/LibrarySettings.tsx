import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSections, createSection, updateSection, deleteSection } from '../api/client'

interface Section {
  id: number
  name: string
  description?: string
  genres?: string
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

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['sections'],
    queryFn: () => getSections().then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => createSection({ name: newName, description: newDesc, genres: newGenres }),
    onSuccess: () => {
      toast.success('Section created')
      qc.invalidateQueries({ queryKey: ['sections'] })
      setNewName('')
      setNewDesc('')
      setNewGenres('')
    },
    onError: () => toast.error('Failed to create section'),
  })

  const updateMutation = useMutation({
    mutationFn: (id: number) => updateSection(id, { name: editName, description: editDesc, genres: editGenres }),
    onSuccess: () => {
      toast.success('Section updated')
      qc.invalidateQueries({ queryKey: ['sections'] })
      setEditId(null)
    },
    onError: () => toast.error('Failed to update section'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSection(id),
    onSuccess: () => {
      toast.success('Section deleted')
      qc.invalidateQueries({ queryKey: ['sections'] })
    },
    onError: () => toast.error('Failed to delete section'),
  })

  const startEdit = (s: Section) => {
    setEditId(s.id)
    setEditName(s.name)
    setEditDesc(s.description ?? '')
    setEditGenres(s.genres ?? '')
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    createMutation.mutate()
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Library Settings</h1>

      {/* Sections list */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Sections</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sections represent physical areas of your library (e.g., "Living Room Shelf", "Study Bookcase").
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : sections.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No sections yet. Create one below.</p>
        ) : (
          <div className="space-y-2 mb-6">
            {(sections as Section[]).map((s) => (
              <div key={s.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {editId === s.id ? (
                  <div className="p-3 space-y-2">
                    <input className="input text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Section name" />
                    <input className="input text-sm" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description (optional)" />
                    <input className="input text-sm" value={editGenres} onChange={(e) => setEditGenres(e.target.value)} placeholder="Genres (e.g. Fiction, Fantasy)" />
                    <div className="flex gap-2">
                      <button onClick={() => updateMutation.mutate(s.id)} disabled={!editName.trim()} className="btn-primary flex-1 py-1.5 text-sm">
                        <Check size={14} /> Save
                      </button>
                      <button onClick={() => setEditId(null)} className="btn-secondary flex-1 py-1.5 text-sm">
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                      {s.description && <p className="text-xs text-gray-500 truncate">{s.description}</p>}
                      {s.genres && <p className="text-xs text-blue-500 truncate">{s.genres}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => confirm(`Delete section "${s.name}"?`) && deleteMutation.mutate(s.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create new section */}
        <form onSubmit={handleCreate} className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Plus size={15} /> New Section
          </h3>
          <input className="input text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Section name *" />
          <input className="input text-sm" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" />
          <input className="input text-sm" value={newGenres} onChange={(e) => setNewGenres(e.target.value)} placeholder="Genres (e.g. Fiction, Thriller)" />
          <button type="submit" disabled={!newName.trim() || createMutation.isPending} className="btn-primary">
            <Plus size={16} /> Create Section
          </button>
        </form>
      </div>
    </div>
  )
}
