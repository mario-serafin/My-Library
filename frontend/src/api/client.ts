import axios from 'axios'

const api = axios.create({ baseURL: '' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// ---- Auth ----
export const login = (username: string, password: string) => {
  const form = new FormData()
  form.append('username', username)
  form.append('password', password)
  return api.post('/api/auth/login', form)
}

export const getMe = () => api.get('/api/auth/me')

// ---- Books ----
export const getBooks = (params: Record<string, unknown>) => api.get('/api/books', { params })
export const searchBooks = (title: string, author: string) =>
  api.post('/api/books/search', { title, author })
export const createBook = (data: Record<string, unknown>) => api.post('/api/books', data)
export const updateBook = (id: number, data: Record<string, unknown>) => api.put(`/api/books/${id}`, data)
export const deleteBook = (id: number) => api.delete(`/api/books/${id}`)

// ---- Sections ----
export const getSections = () => api.get('/api/sections')
export const createSection = (data: Record<string, unknown>) => api.post('/api/sections', data)
export const updateSection = (id: number, data: Record<string, unknown>) => api.put(`/api/sections/${id}`, data)
export const deleteSection = (id: number) => api.delete(`/api/sections/${id}`)
export const clearSection = (id: number) => api.delete(`/api/sections/${id}/books`)

// ---- Tasks ----
export const getTasks = (params?: Record<string, unknown>) => api.get('/api/tasks', { params })
export const getPendingCount = () => api.get('/api/tasks/pending-count')
export const getTask = (id: number) => api.get(`/api/tasks/${id}`)
export const uploadImage = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/api/tasks/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const retryTask = (id: number, title: string, author: string) =>
  api.post(`/api/tasks/${id}/retry`, { title, author })
export const confirmTask = (id: number, data: Record<string, unknown>) =>
  api.post(`/api/tasks/${id}/confirm`, data)
export const dismissTask = (id: number) => api.post(`/api/tasks/${id}/dismiss`)
export const deleteTask = (id: number) => api.delete(`/api/tasks/${id}`)
export const deleteAllDismissed = () => api.delete('/api/tasks')

// ---- Users ----
export const getUsers = () => api.get('/api/users')
export const createUser = (data: Record<string, unknown>) => api.post('/api/users', data)
export const updateUser = (id: number, data: Record<string, unknown>) => api.put(`/api/users/${id}`, data)
export const deleteUser = (id: number) => api.delete(`/api/users/${id}`)
export const setDefaultSection = (sectionId: number) =>
  api.put(`/api/users/me/default-section?section_id=${sectionId}`)
