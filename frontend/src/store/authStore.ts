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
  setAuth: (user: User, token: string) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),

  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    set({ user, token })
  },

  setUser: (user) => set({ user }),

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },
}))
