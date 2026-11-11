import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyTheme, getSavedTheme } from './utils/theme'

// Apply theme before first paint. Defaults to dark for first-time visitors.
applyTheme(getSavedTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

