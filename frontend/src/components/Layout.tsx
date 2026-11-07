import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, PlusCircle, Clock, Settings, Users, LogOut, Menu, X, Library } from 'lucide-react'
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

  const items = [
    { to: '/collection', label: 'Collezione', icon: <BookOpen size={16} /> },
    { to: '/add', label: 'Aggiungi libro', icon: <PlusCircle size={16} /> },
    { to: '/tasks', label: 'Task', icon: <Clock size={16} />, count: pendingCount },
    { to: '/settings', label: 'Impostazioni', icon: <Settings size={16} /> },
    ...(user?.role === 'admin' ? [{ to: '/users', label: 'Utenti', icon: <Users size={16} /> }] : []),
  ]

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700'
        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
    }`

  const countBadge = (n?: number) =>
    n ? (
      <span className="ml-0.5 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">
        {n}
      </span>
    ) : null

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-paper/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <NavLink to="/collection" className="flex items-center gap-2.5 flex-shrink-0">
            <span className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-sm">
              <Library size={19} />
            </span>
            <span className="font-serif text-lg font-semibold text-stone-900 hidden sm:block">
              La mia libreria
            </span>
          </NavLink>

          {/* Navigazione desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass}>
                {item.icon} {item.label} {countBadge(item.count)}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <span className="hidden sm:flex items-center gap-2 pr-2 text-sm text-stone-600">
              <span className="w-7 h-7 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-semibold uppercase">
                {user?.username?.[0] ?? '?'}
              </span>
              {user?.username}
            </span>
            <button onClick={handleLogout} className="icon-btn" title="Esci" aria-label="Esci">
              <LogOut size={18} />
            </button>
            <button
              className="md:hidden icon-btn text-stone-600"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'Chiudi menu' : 'Apri menu'}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Navigazione mobile */}
        {menuOpen && (
          <div className="md:hidden border-t border-stone-200/70 bg-paper px-4 py-3 flex flex-col gap-1">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass} onClick={() => setMenuOpen(false)}>
                {item.icon} {item.label} {countBadge(item.count)}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
