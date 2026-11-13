import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { env, releaseProblem } from './lib/env'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

// A build for real clients must never run on demo data. The build itself
// refuses (vite.config.ts); this is the second lock, in case it is bypassed.
const problem = releaseProblem(env)

if (problem) {
  container.innerHTML = ''
  const message = document.createElement('main')
  message.setAttribute('role', 'alert')
  message.style.cssText =
    'padding:24px;font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto'
  message.textContent = `Tallybox can't start: this build is set up wrongly. ${problem}`
  container.append(message)
} else {
  // Rendering replaces the branded loading screen that index.html shows first.
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
