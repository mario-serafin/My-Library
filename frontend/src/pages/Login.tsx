import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Library } from 'lucide-react'
import toast from 'react-hot-toast'
import { login } from '../api/client'
import { apiStatus, errorMessage } from '../api/errors'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    try {
      const res = await login(username, password)
      setAuth(res.data.user, res.data.access_token)
      navigate('/collection')
    } catch (err) {
      // Distingue credenziali errate da problemi di rete/server
      if (apiStatus(err) === 401) toast.error('Nome utente o password non corretti')
      else toast.error(errorMessage(err, 'Accesso non riuscito. Riprova.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-paper bg-[radial-gradient(ellipse_at_top,_theme(colors.brand.100),_transparent_60%)]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mb-4 shadow-lift">
            <Library size={28} className="text-white" />
          </div>
          <h1 className="font-serif text-3xl font-semibold">La mia libreria</h1>
          <p className="text-sm text-stone-500 mt-1.5">Accedi per consultare la tua collezione</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-7 space-y-4">
          <div>
            <label className="label" htmlFor="username">Nome utente</label>
            <input
              id="username"
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}
