import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

// Rendering replaces the branded loading screen that index.html shows first.
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
