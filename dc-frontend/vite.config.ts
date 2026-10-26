import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// In development the SPA calls /api on its own origin and Vite forwards it to FastAPI, so the
// session cookie is first-party. Override the target when the backend runs elsewhere (Docker).
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/health': { target: apiTarget, changeOrigin: true },
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
})
