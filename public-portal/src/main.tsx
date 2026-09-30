import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PublicLayout from './public/PublicLayout'
import HomePage from './public/HomePage'
import JobDetailPage from './public/JobDetailPage'
import ApplicationFormPage from './public/ApplicationFormPage'
import SuccessPage from './public/SuccessPage'
import { ToastProvider } from './components/ui/Kit'

// Router hash simples: #/ , #/vaga/:slug , #/candidatar/:slug , #/obrigado/:slug

function parseHash(): { name: string; param: string | null } {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const parts = raw.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home', param: null }
  if (parts[0] === 'vaga' && parts[1]) return { name: 'job', param: parts[1] }
  if (parts[0] === 'candidatar' && parts[1]) return { name: 'apply', param: parts[1] }
  if (parts[0] === 'obrigado') return { name: 'thanks', param: parts[1] ?? null }
  return { name: 'home', param: null }
}

function useHashRoute() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

function App() {
  const route = useHashRoute()
  const navigate = useCallback((to: string) => {
    window.location.hash = to
  }, [])

  let page: React.ReactNode
  if (route.name === 'job' && route.param) page = <JobDetailPage slug={route.param} navigate={navigate} />
  else if (route.name === 'apply' && route.param)
    page = <ApplicationFormPage slug={route.param} navigate={navigate} />
  else if (route.name === 'thanks') page = <SuccessPage navigate={navigate} />
  else page = <HomePage navigate={navigate} />

  return <PublicLayout>{page}</PublicLayout>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
)
