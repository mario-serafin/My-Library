import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, ShieldCheck, User as UserIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUsers, createUser, updateUser, deleteUser } from '../api/client'
import { useAuthStore } from '../store/authStore'

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
      toast.success('User created')
      qc.invalidateQueries({ queryKey: ['users'] })
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
    },
    onError: (err: any) => {
      if (err.response?.data?.detail?.includes('taken')) toast.error('Username already taken')
      else toast.error('Failed to create user')
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
      toast.success('User updated')
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditId(null)
      setEditPassword('')
    },
    onError: () => toast.error('Failed to update user'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      toast.success('User deleted')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: () => toast.error('Failed to delete user'),
  })

  const startEdit = (u: User) => {
    setEditId(u.id)
    setEditRole(u.role)
    setEditActive(u.is_active)
    setEditPassword('')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">User Management</h1>

      {/* Users list */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Users</h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {(users as User[]).map((u) => (
              <div key={u.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {editId === u.id ? (
                  <div className="p-4 space-y-3">
                    <p className="font-medium text-gray-900">{u.username}</p>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">New password (leave blank to keep)</label>
                      <input
                        className="input text-sm"
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="New password"
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Role</label>
                        <select className="input text-sm" value={editRole} onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}>
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                            className="rounded"
                          />
                          Active
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateMutation.mutate(u.id)} className="btn-primary flex-1 py-1.5 text-sm">Save</button>
                      <button onClick={() => setEditId(null)} className="btn-secondary flex-1 py-1.5 text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-shrink-0">
                      {u.role === 'admin' ? (
                        <ShieldCheck size={18} className="text-blue-500" />
                      ) : (
                        <UserIcon size={18} className="text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{u.username}</p>
                        <span className={`badge ${u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {u.role}
                        </span>
                        {!u.is_active && <span className="badge bg-red-100 text-red-600">inactive</span>}
                        {u.id === currentUser?.id && <span className="badge bg-green-100 text-green-600">you</span>}
                      </div>
                      {u.email && <p className="text-xs text-gray-400">{u.email}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(u)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                        <Edit2 size={15} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => confirm(`Delete user "${u.username}"?`) && deleteMutation.mutate(u.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
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
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Plus size={18} /> Create User
        </h2>
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}
          className="space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
            <input className="input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="username" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!newUsername.trim() || !newPassword.trim() || createMutation.isPending}
            className="btn-primary"
          >
            <Plus size={16} /> Create User
          </button>
        </form>
      </div>
    </div>
  )
}
