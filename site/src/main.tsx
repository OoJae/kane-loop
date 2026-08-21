import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import App from './App'
import HowItWorks from './pages/HowItWorks'
import Evidence from './pages/Evidence'
import Log from './pages/Log'
import NotFound from './pages/NotFound'

/**
 * Without this a route change keeps the previous page's scroll position, which
 * on a site whose first section is a 4,000px pinned scene means landing halfway
 * through someone else's story. Hash links keep their own behaviour.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) return
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/evidence" element={<Evidence />} />
        <Route path="/log" element={<Log />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
