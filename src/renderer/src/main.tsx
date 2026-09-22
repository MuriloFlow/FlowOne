import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

async function boot(): Promise<void> {
  if (import.meta.env.VITE_FLOW_SHELL === 'mobile') {
    document.documentElement.classList.add('flow-mobile-shell')
    const { installMobileSafeArea } = await import('./lib/mobile-safe-area')
    installMobileSafeArea()
    const { installFlowMobileBridge } = await import('./lib/flow-mobile-bridge')
    await installFlowMobileBridge()
    const { runSilentUpdate } = await import('./lib/live-update')
    // An OTA update must not keep the application on the splash screen while
    // a mobile connection waits for GitHub.
    void runSilentUpdate()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void boot()
