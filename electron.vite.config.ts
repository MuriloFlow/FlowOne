import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const VPS_URL = 'https://flowone.db.flwdesk.com'
const VPS_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMDI5NjAwLCJleHAiOjE5NDc3MDk2MDB9.yPgutsfUlQPS6mjSegQU8MRTaPNK9cKqJiSopVh0GDA'

function isLegacySupabaseHost(url?: string) {
  if (!url) return true
  return url.includes('supabase.co') || url.includes('2.25.237.179')
}

const env = loadEnv(process.env.MODE || 'production', process.cwd(), 'VITE_')
const supabaseUrl = isLegacySupabaseHost(env.VITE_SUPABASE_URL) ? VPS_URL : env.VITE_SUPABASE_URL
const supabaseAnonKey =
  !env.VITE_SUPABASE_ANON_KEY || isLegacySupabaseHost(env.VITE_SUPABASE_URL) ? VPS_ANON_KEY : env.VITE_SUPABASE_ANON_KEY

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
        '@capacitor/filesystem': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts'),
        '@capacitor/share': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts'),
        '@capacitor/screen-orientation': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts'),
        '@capgo/capacitor-updater': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts'),
        '@capgo/capacitor-native-biometric': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts'),
        '@capacitor/local-notifications': resolve('src/renderer/src/lib/capacitor-desktop-stub.ts')
      }
    },
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl ?? VPS_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey ?? VPS_ANON_KEY)
    }
  }
})
