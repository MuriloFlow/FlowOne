import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/ipc'

const idle: UpdateStatus = { state: 'idle' }

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>(idle)

  useEffect(() => {
    if (!window.flow) return

    void window.flow.updater.getStatus().then(setStatus)
    return window.flow.updater.onStatus(setStatus)
  }, [])

  return status
}
