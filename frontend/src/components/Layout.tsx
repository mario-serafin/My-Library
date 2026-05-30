import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, PlusCircle, Clock, Settings, Users, LogOut, ChevronDown, Menu, X, AlertCircle
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { getSections, getPendingCount, setDefaultSection } from '../api/client'
import SectionPickerModal from './SectionPickerModal'

export default function Layout() {
  const { user, activeSection, setActiveSection, logout } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sectionDropdown, setSectionDropdown] = useState(false)
  const [showSectionPicker, setShowSectionPicker] = useState(!activeSection)

  const { data: sections } = useQuery({
    queryKey: ['sections'],
    queryFn: () => getSections().then((r) => r.data),
  })

  const { data: pendingData } = useQuery({
    queryKey: ['pending-count'],
    queryFn: () => getPendingCount().then((r) => r.data),
    refetchInterval: 15_000,
  })

  const pendingCount: number = pendingData?.count ?? 0
  const activeSectionName = sections?.find((s: { id: number; name: string }) => s.id === activeSection)?.name

  const handleSectionSelect = async (sectionId: number) => {
    setActiveSection(sectionId)
    setSectionDropdown(false)
    try {
      await setDefaultSection(sectionId)
    } catch {}
  }

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
              <BookOpen size={16} /> Collection
            </NavLink>
            <NavLink to="/add" className={navClass}>
              <PlusCircle size={16} /> Add Book
            </NavLink>
            <NavLink to="/tasks" className={navClass}>
              <Clock size={16} /> Tasks
              {pendingCount > 0 && (
                <span className="badge bg-red-100 text-red-700 ml-1">{pendingCount}</span>
              )}
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              <Settings size={16} /> Settings
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/users" className={navClass}>
                <Users size={16} /> Users
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {/* Section selector */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setSectionDropdown(!sectionDropdown)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-gray-500 text-xs">Section:</span>
                <span className="font-medium text-gray-800 max-w-24 truncate">
                  {activeSectionName ?? 'Choose…'}
                </span>
                <ChevronDown size={14} className="text-gray-500" />
              </button>
              {sectionDropdown && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  {sections?.map((s: { id: number; name: string }) => (
                    <button
                      key={s.id}
                      onClick={() => handleSectionSelect(s.id)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                        s.id === activeSection ? 'text-blue-600 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                  {!sections?.length && (
                    <p className="px-4 py-2 text-sm text-gray-400">No sections yet</p>
                  )}
                </div>
              )}
            </div>

            <span className="text-sm text-gray-500 hidden sm:block">{user?.username}</span>
            <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100" title="Logout">
              <LogOut size={18} />
            </button>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-1.5 text-gray-600"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-2 flex flex-col gap-1">
            {[
              { to: '/collection', label: 'Collection', icon: <BookOpen size={16} /> },
              { to: '/add', label: 'Add Book', icon: <PlusCircle size={16} /> },
              { to: '/tasks', label: `Tasks${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: <Clock size={16} /> },
              { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
              ...(user?.role === 'admin' ? [{ to: '/users', label: 'Users', icon: <Users size={16} /> }] : []),
            ].map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass} onClick={() => setMenuOpen(false)}>
                {item.icon} {item.label}
              </NavLink>
            ))}
            {/* Section selector in mobile */}
            <div className="pt-2 pb-1 border-t border-gray-100 mt-1">
              <p className="text-xs text-gray-400 mb-1">Active Section</p>
              <div className="flex flex-wrap gap-1">
                {sections?.map((s: { id: number; name: string }) => (
                  <button
                    key={s.id}
                    onClick={() => { handleSectionSelect(s.id); setMenuOpen(false) }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      s.id === activeSection ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      {showSectionPicker && sections && sections.length > 0 && (
        <SectionPickerModal
          sections={sections}
          onSelect={(id) => { handleSectionSelect(id); setShowSectionPicker(false) }}
          onDismiss={() => setShowSectionPicker(false)}
        />
      )}

      {sectionDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setSectionDropdown(false)} />
      )}
    </div>
  )
}
