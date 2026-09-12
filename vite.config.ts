import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Base path is configurable for GitHub Pages deployments (serves under /<repo>/).
// Locally and on Freebuff, default '/' works fine.
const base = process.env.VITE_BASE || '/'

// Multi-page app: index.html is the public website; local.html is the slim
// entry the `slitex` CLI serves with the database pre-opened.
export default defineConfig({
  base,
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        local: resolve(__dirname, 'local.html'),
      },
    },
  },
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
