import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, PlusCircle, Clock, Settings, Users, LogOut, Menu, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { getPendingCount } from '../api/client'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: pendingData } = useQuery({
    queryKey: ['pending-count'],
    queryFn: () => getPendingCount().then((r) => r.data),
    refetchInterval: 15_000,
  })

  const pendingCount: number = pendingData?.count ?? 0

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="text-blue-600" size={22} />
            <span className="font-bold text-gray-900 hidden sm:block">My Library</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/collection" className={navClass}>
              <BookOpen size={16} /> Collezione
            </NavLink>
            <NavLink to="/add" className={navClass}>
              <PlusCircle size={16} /> Aggiungi libro
            </NavLink>
            <NavLink to="/tasks" className={navClass}>
              <Clock size={16} /> Task
              {pendingCount > 0 && (
                <span className="badge bg-red-100 text-red-700 ml-1">{pendingCount}</span>
              )}
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              <Settings size={16} /> Impostazioni
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/users" className={navClass}>
                <Users size={16} /> Utenti
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 hidden sm:block">{user?.username}</span>
            <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100" title="Logout">
              <LogOut size={18} />
            </button>
            <button className="md:hidden p-1.5 text-gray-600" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-2 flex flex-col gap-1">
            {[
              { to: '/collection', label: 'Collezione', icon: <BookOpen size={16} /> },
              { to: '/add', label: 'Aggiungi libro', icon: <PlusCircle size={16} /> },
              { to: '/tasks', label: `Task${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: <Clock size={16} /> },
              { to: '/settings', label: 'Impostazioni', icon: <Settings size={16} /> },
              ...(user?.role === 'admin' ? [{ to: '/users', label: 'Utenti', icon: <Users size={16} /> }] : []),
            ].map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass} onClick={() => setMenuOpen(false)}>
                {item.icon} {item.label}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
