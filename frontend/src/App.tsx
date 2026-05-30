import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { getMe } from './api/client'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Collection from './pages/Collection'
import AddBook from './pages/AddBook'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import LibrarySettings from './pages/LibrarySettings'
import UserManagement from './pages/UserManagement'

export default function App() {
  const { token, setUser, logout } = useAuthStore()

  useEffect(() => {
    if (token) {
      getMe()
        .then((r) => setUser(r.data))
        .catch(() => logout())
    }
  }, [token])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/collection" replace />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/add" element={<AddBook />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/settings" element={<LibrarySettings />} />
            <Route path="/users" element={<UserManagement />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
