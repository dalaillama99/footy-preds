import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthCallback() {
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      login(token)
      navigate('/', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }, [])

  return <div className="flex items-center justify-center h-screen text-gray-500">Signing you in…</div>
}
