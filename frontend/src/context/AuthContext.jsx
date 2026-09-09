import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import client, { KEYS } from '../api/client'

const AuthContext = createContext(null)

function parseJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

function isExpired(payload) {
  if (!payload?.exp) return true
  return payload.exp * 1000 < Date.now()
}

function buildUserFromToken(token, email) {
  const payload = parseJwtPayload(token)
  if (!payload) return null
  return {
    id: payload.user_id,
    email: email ?? payload.email ?? '',
    role: payload.role,
    department_ids: payload.department_ids ?? [],
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadAccountDetails = useCallback(async (baseUser) => {
    try {
      const { data } = await client.get('/auth/me')
      const userData = {
        ...baseUser,
        email: data.email || baseUser.email,
        college_id: data.college_id || '',
        department: data.department ?? null,
      }
      localStorage.setItem(KEYS.USER, JSON.stringify(userData))
      setUser(userData)
      return userData
    } catch {
      return baseUser
    }
  }, [])

  const tryRefresh = useCallback(async () => {
    const refreshToken = localStorage.getItem(KEYS.REFRESH)
    if (!refreshToken) return false
    try {
      const { data } = await client.post('/auth/refresh', { refresh_token: refreshToken })
      localStorage.setItem(KEYS.ACCESS, data.access_token)
      if (data.refresh_token) localStorage.setItem(KEYS.REFRESH, data.refresh_token)
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    async function init() {
      const accessToken = localStorage.getItem(KEYS.ACCESS)
      if (!accessToken) { setLoading(false); return }

      let tokenToUse = accessToken
      const payload = parseJwtPayload(accessToken)

      if (isExpired(payload)) {
        const ok = await tryRefresh()
        if (!ok) {
          localStorage.removeItem(KEYS.ACCESS)
          localStorage.removeItem(KEYS.REFRESH)
          localStorage.removeItem(KEYS.USER)
          setLoading(false)
          return
        }
        tokenToUse = localStorage.getItem(KEYS.ACCESS)
      }

      const cached = localStorage.getItem(KEYS.USER)
      let storedEmail = null
      if (cached) {
        try { storedEmail = JSON.parse(cached).email } catch { /* ignore */ }
      }

      const userData = buildUserFromToken(tokenToUse, storedEmail)
      if (userData) {
        localStorage.setItem(KEYS.USER, JSON.stringify(userData))
        setUser(userData)
        loadAccountDetails(userData)
      }

      setLoading(false)
    }

    init()
  }, [tryRefresh, loadAccountDetails])

  // Returns the user object so callers can act on role immediately.
  const login = async (email, password) => {
    // Send as a pre-serialized string so Axios doesn't re-serialize it as JSON.
    // URLSearchParams objects get JSON.stringified to {} by Axios when the
    // instance default Content-Type is application/json.
    const body = new URLSearchParams({ username: email, password }).toString()
    const { data } = await client.post('/auth/login', body, {
      skipAuth: true,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    localStorage.setItem(KEYS.ACCESS, data.access_token)
    localStorage.setItem(KEYS.REFRESH, data.refresh_token)

    const userData = buildUserFromToken(data.access_token, email)
    if (userData) {
      localStorage.setItem(KEYS.USER, JSON.stringify(userData))
      setUser(userData)
      loadAccountDetails(userData)
    }
    return userData
  }

  const register = async (college_id, email, password, confirm_password, department_id, verification_token) => {
    const { data } = await client.post('/auth/register', {
      college_id,
      email,
      password,
      confirm_password,
      ...(department_id ? { department_id } : {}),
      verification_token,
    })
    return data
  }

  const logout = async () => {
    const refreshToken = localStorage.getItem(KEYS.REFRESH)
    try {
      if (refreshToken) await client.post('/auth/logout', { refresh_token: refreshToken })
    } catch { /* ignore */ }
    localStorage.removeItem(KEYS.ACCESS)
    localStorage.removeItem(KEYS.REFRESH)
    localStorage.removeItem(KEYS.USER)
    setUser(null)
  }

  const loginWithTokens = (accessToken, refreshToken) => {
    localStorage.setItem(KEYS.ACCESS, accessToken)
    localStorage.setItem(KEYS.REFRESH, refreshToken)
    const userData = buildUserFromToken(accessToken, null)
    if (userData) {
      localStorage.setItem(KEYS.USER, JSON.stringify(userData))
      setUser(userData)
      loadAccountDetails(userData)
    }
    return userData
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthenticated: Boolean(user), login, loginWithTokens, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
