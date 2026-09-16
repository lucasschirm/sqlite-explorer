import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, type Connect, type Plugin } from 'vite'

// /docs/* and /about only exist as files after the SSG post-build step.
// Dev: always serve index.html (the app hydrates the static page).
// Preview: serve the prerendered file when present, else the app shell.
function staticPageRoutes(distDir: string): Plugin {
  const isStatic = (url: string) => url === '/about' || url === '/docs' || url.startsWith('/docs/')
  const devMw: Connect.NextHandleFunction = (req, _res, next) => {
    const url = (req.url ?? '').split('?')[0]
    if (isStatic(url)) req.url = '/index.html'
    next()
  }
  const previewMw: Connect.NextHandleFunction = (req, _res, next) => {
    const url = (req.url ?? '').split('?')[0]
    if (isStatic(url)) {
      const prerendered = join(distDir, url.slice(1), 'index.html')
      req.url = existsSync(prerendered) ? `${url}/index.html` : '/index.html'
    }
    next()
  }
  return {
    name: 'static-page-routes',
    configureServer(server) {
      server.middlewares.use(devMw)
    },
    configurePreviewServer(server) {
      server.middlewares.use(previewMw)
    },
  }
}

// Base path is configurable for GitHub Pages deployments (serves under /<repo>/).
// Locally and on Freebuff, default '/' works fine.
const base = process.env.VITE_BASE || '/'

// index.html serves the whole site: / boots the client-rendered explorer,
// while every docs page and /about are prerendered to static HTML by the
// post-build SSG step (scripts/prerender.mjs + src/prerender.tsx) and hydrated
// by this
// same entry. local.html is the slim entry the `sqlitexp` CLI serves with the
// database pre-opened.
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
  plugins: [react(), tailwindcss(), staticPageRoutes(resolve(__dirname, 'dist'))],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4173,
  },
})
