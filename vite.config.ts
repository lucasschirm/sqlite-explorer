import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Base path is configurable for GitHub Pages deployments (serves under /<repo>/).
// Locally and on Freebuff, default '/' works fine.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4173,
  },
})
