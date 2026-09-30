import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Base relativa: o site é servido em rh.flwdesk.com/digaspi/ pelo Caddy.
export default defineConfig({
  base: '/digaspi/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
