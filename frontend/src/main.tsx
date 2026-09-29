import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { recoverPreloadError } from './utils/preloadRecovery'

window.addEventListener('vite:preloadError', event => {
  try { recoverPreloadError(event, window.sessionStorage, () => window.location.reload()); }
  catch { /* Keep the normal error boundary if browser storage is unavailable. */ }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
