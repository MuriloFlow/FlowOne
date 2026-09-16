import { useCallback, useEffect, useState } from 'react'
import type { AuthUser } from '@/lib/auth'
import { restoreSession, signOut } from '@/lib/auth'

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [booting, setBooting] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const restored = await restoreSession()
      setUser(restored)
    } catch {
      setUser(null)
    } finally {
      setBooting(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setUser(null)
  }, [])

  useEffect(() => {
    void refresh()
    const onChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail) {
        setUser(event.detail)
        setBooting(false)
        return
      }
      void refresh()
    }
    window.addEventListener('flow:auth-changed', onChange)
    return () => window.removeEventListener('flow:auth-changed', onChange)
  }, [refresh])

  return { user, booting, refresh, logout }
}
