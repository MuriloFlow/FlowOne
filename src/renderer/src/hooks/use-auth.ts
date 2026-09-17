import { useCallback, useEffect, useState } from 'react'
import type { AuthUser } from '@/lib/auth'
import { AuthFlowError, restoreSession, signOut } from '@/lib/auth'

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const restored = await restoreSession()
      setUser(restored)
      setRestoreError(null)
    } catch (caught) {
      setUser(null)
      setRestoreError(
        caught instanceof AuthFlowError ? caught.message : 'Não foi possível restaurar a sessão. Entre novamente.'
      )
    } finally {
      setBooting(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setUser(null)
    setRestoreError(null)
  }, [])

  useEffect(() => {
    void refresh()
    const onChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail) {
        setUser(event.detail)
        setRestoreError(null)
        setBooting(false)
        return
      }
      void refresh()
    }
    window.addEventListener('flow:auth-changed', onChange)
    return () => window.removeEventListener('flow:auth-changed', onChange)
  }, [refresh])

  return { user, booting, restoreError, refresh, logout }
}
