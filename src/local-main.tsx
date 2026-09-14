import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// CLI mode: auto-open the database the slitex server was launched with.
// Renders the explorer directly — the drop zone never appears unless the
// database fails to open.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App cliMode />
  </StrictMode>,
)
