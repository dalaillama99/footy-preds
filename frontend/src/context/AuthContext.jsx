import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewNonAdmin, setPreviewNonAdmin] = useState(() => localStorage.getItem('previewNonAdmin') === '1')

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
    } catch {
      localStorage.removeItem('token')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMe() }, [fetchMe])

  // Cross-tab sync: the browser's native `storage` event fires in other tabs
  // when localStorage changes, but never in the tab that made the change —
  // togglePreviewNonAdmin() below updates this tab's own state directly.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'previewNonAdmin') {
        setPreviewNonAdmin(localStorage.getItem('previewNonAdmin') === '1')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const login = (token) => {
    localStorage.setItem('token', token)
    fetchMe()
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  const togglePreviewNonAdmin = () => {
    const next = !previewNonAdmin
    if (next) localStorage.setItem('previewNonAdmin', '1')
    else localStorage.removeItem('previewNonAdmin')
    setPreviewNonAdmin(next)
  }

  const isAdmin = user?.is_admin && !previewNonAdmin

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser, previewNonAdmin, togglePreviewNonAdmin, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
