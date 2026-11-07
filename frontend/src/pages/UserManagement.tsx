import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, ShieldCheck, User as UserIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUsers, createUser, updateUser, deleteUser } from '../api/client'
import { apiStatus, errorMessage } from '../api/errors'
import { useAuthStore } from '../store/authStore'

const ROLE_LABEL: Record<'admin' | 'user', string> = { admin: 'Amministratore', user: 'Utente' }

interface User {
  id: number
  username: string
  email?: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
}

export default function UserManagement() {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')

  const [editId, setEditId] = useState<number | null>(null)
  const [editPassword, setEditPassword] = useState('')
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user')
  const [editActive, setEditActive] = useState(true)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => getUsers().then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => createUser({ username: newUsername, password: newPassword, role: newRole }),
    onSuccess: () => {
      toast.success('Utente creato')
      qc.invalidateQueries({ queryKey: ['users'] })
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
    },
    onError: (err) => {
      if (apiStatus(err) === 409) toast.error('Nome utente già in uso')
      else toast.error(errorMessage(err, 'Impossibile creare l\'utente'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (id: number) =>
      updateUser(id, {
        ...(editPassword ? { password: editPassword } : {}),
        role: editRole,
        is_active: editActive,
      }),
    onSuccess: () => {
      toast.success('Utente aggiornato')
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditId(null)
      setEditPassword('')
    },
    onError: (err) => toast.error(errorMessage(err, 'Impossibile aggiornare l\'utente')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      toast.success('Utente eliminato')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => toast.error(errorMessage(err, 'Impossibile eliminare l\'utente')),
  })

  const startEdit = (u: User) => {
    setEditId(u.id)
    setEditRole(u.role)
    setEditActive(u.is_active)
    setEditPassword('')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="page-title">Gestione utenti</h1>
        <p className="page-subtitle">Chi può accedere alla libreria e con quali permessi.</p>
      </div>

      {/* Users list */}
      <div className="card p-6 mb-6">
        <h2 className="font-serif text-xl font-semibold mb-4">Utenti</h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 skeleton rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {(users as User[]).map((u) => (
              <div key={u.id} className="border border-stone-200 rounded-xl overflow-hidden bg-white">
                {editId === u.id ? (
                  <div className="p-4 space-y-3">
                    <p className="font-medium text-stone-900">{u.username}</p>
                    <div>
                      <label className="label">Nuova password (lascia vuoto per non cambiarla)</label>
                      <input
                        className="input text-sm"
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Nuova password"
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="label">Ruolo</label>
                        <select className="input text-sm" value={editRole} onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}>
                          <option value="user">{ROLE_LABEL.user}</option>
                          <option value="admin">{ROLE_LABEL.admin}</option>
                        </select>
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-2 text-sm text-stone-700 pb-2">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                            className="rounded border-stone-300 text-brand-600 focus:ring-brand-500"
                          />
                          Attivo
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateMutation.mutate(u.id)} className="btn-primary flex-1 py-1.5">Salva</button>
                      <button onClick={() => setEditId(null)} className="btn-secondary flex-1 py-1.5">Annulla</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-shrink-0">
                      {u.role === 'admin' ? (
                        <ShieldCheck size={18} className="text-brand-600" />
                      ) : (
                        <UserIcon size={18} className="text-stone-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-stone-900 text-sm">{u.username}</p>
                        <span className={`badge ${u.role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-stone-100 text-stone-600'}`}>
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                        {!u.is_active && <span className="badge bg-red-100 text-red-600">disattivato</span>}
                        {u.id === currentUser?.id && <span className="badge bg-amber-100 text-amber-800">tu</span>}
                      </div>
                      {u.email && <p className="text-xs text-stone-400">{u.email}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(u)} className="icon-btn p-1.5 hover:text-brand-700 hover:bg-brand-50" title="Modifica utente" aria-label="Modifica utente">
                        <Edit2 size={15} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => confirm(`Eliminare l'utente "${u.username}"?`) && deleteMutation.mutate(u.id)}
                          className="icon-btn p-1.5 hover:text-red-600 hover:bg-red-50"
                          title="Elimina utente"
                          aria-label="Elimina utente"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create user */}
      <div className="card p-6">
        <h2 className="font-serif text-xl font-semibold mb-4 flex items-center gap-2">
          <Plus size={18} /> Nuovo utente
        </h2>
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}
          className="space-y-3"
        >
          <div>
            <label className="label">Nome utente *</label>
            <input className="input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="es. mario" />
          </div>
          <div>
            <label className="label">Password *</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="password" />
          </div>
          <div>
            <label className="label">Ruolo</label>
            <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}>
              <option value="user">{ROLE_LABEL.user}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!newUsername.trim() || !newPassword.trim() || createMutation.isPending}
            className="btn-primary"
          >
            <Plus size={16} /> Crea utente
          </button>
        </form>
      </div>
    </div>
  )
}
