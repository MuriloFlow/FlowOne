import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@capacitor/core': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts'),
        '@capacitor/preferences': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts'),
        '@capacitor/app': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts'),
        '@capgo/capacitor-updater': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
