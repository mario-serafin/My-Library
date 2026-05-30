import { create } from 'zustand'

export interface User {
  id: number
  username: string
  role: 'admin' | 'user'
  default_section_id: number | null
  email: string | null
  is_active: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  activeSection: number | null
  setAuth: (user: User, token: string) => void
  setUser: (user: User) => void
  setActiveSection: (id: number | null) => void
  logout: () => void
}

const storedSection = localStorage.getItem('activeSection')

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  activeSection: storedSection ? parseInt(storedSection) : null,

  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    const section = user.default_section_id
    if (section) localStorage.setItem('activeSection', String(section))
    set({ user, token, activeSection: section ?? (storedSection ? parseInt(storedSection) : null) })
  },

  setUser: (user) => set({ user }),

  setActiveSection: (id) => {
    if (id !== null) localStorage.setItem('activeSection', String(id))
    else localStorage.removeItem('activeSection')
    set({ activeSection: id })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('activeSection')
    set({ user: null, token: null, activeSection: null })
  },
}))
