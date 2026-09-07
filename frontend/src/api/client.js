import axios from 'axios'

const KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
  USER: 'user',
}

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token from localStorage on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(KEYS.ACCESS)
  if (token && !config.skipAuth) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401: attempt token refresh once, then retry. On failure, clear and redirect.
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    // A failed sign-in or registration is an expected form error.  Trying to
    // refresh a previous session here clears storage and reloads /login, which
    // makes the credentials the user just entered appear to have vanished.
    const isAuthFormRequest = original?.url === '/auth/login' || original?.url === '/auth/register'

    const isRefreshRequest = original?.url === '/auth/refresh'
    if (err.response?.status === 401 && !original._retry && !isAuthFormRequest && !isRefreshRequest) {
      original._retry = true

      const refreshToken = localStorage.getItem(KEYS.REFRESH)
      if (!refreshToken) {
        clearSession()
        return Promise.reject(err)
      }

      try {
        // Use a bare axios call to bypass our interceptor and avoid infinite loops
        const { data } = await axios.post('/api/auth/refresh', {
          refresh_token: refreshToken,
        })

        localStorage.setItem(KEYS.ACCESS, data.access_token)
        if (data.refresh_token) localStorage.setItem(KEYS.REFRESH, data.refresh_token)

        original.headers.Authorization = `Bearer ${data.access_token}`
        return client(original)
      } catch (refreshErr) {
        // A transient failure from an optional background request must not
        // forcibly log a user out. A later protected action can refresh again.
        // Only a refresh endpoint response that explicitly rejects the token
        // clears the session. Network/service failures leave the local session
        // intact so the next request can recover normally.
        if (refreshErr.response?.status === 401) clearSession()
        return Promise.reject(err)
      }
    }

    if (err.response?.status === 401 && isRefreshRequest) clearSession()

    return Promise.reject(err)
  }
)

function clearSession() {
  localStorage.removeItem(KEYS.ACCESS)
  localStorage.removeItem(KEYS.REFRESH)
  localStorage.removeItem(KEYS.USER)
  window.location.href = '/login'
}

export { KEYS }
export default client
