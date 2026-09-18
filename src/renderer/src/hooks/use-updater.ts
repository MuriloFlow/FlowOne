import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/ipc'
import { isMobileShell } from '@/lib/is-mobile-shell'

const idle: UpdateStatus = { state: 'idle' }

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>(idle)

  useEffect(() => {
    if (!window.flow || isMobileShell()) return

    void window.flow.updater.getStatus().then(setStatus)
    void window.flow.updater.check().then(setStatus)
    const unsubscribe = window.flow.updater.onStatus(setStatus)
    const timer = window.setInterval(() => {
      void window.flow.updater.check().then(setStatus)
    }, 4_000)
    return () => {
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [])

  return status
}
