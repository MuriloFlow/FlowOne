import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(mobileDir, '..')
const rendererRoot = path.resolve(repoRoot, 'src/renderer')
const rendererSrc = path.resolve(rendererRoot, 'src')
const mobileModules = path.resolve(mobileDir, 'node_modules')

const VPS_URL = 'https://flowone.db.flwdesk.com'
const VPS_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMDI5NjAwLCJleHAiOjE5NDc3MDk2MDB9.yPgutsfUlQPS6mjSegQU8MRTaPNK9cKqJiSopVh0GDA'

function isLegacySupabaseHost(url?: string) {
  if (!url) return true
  return url.includes('supabase.co') || url.includes('2.25.237.179')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, mobileDir, 'VITE_')
  const supabaseUrl = isLegacySupabaseHost(env.VITE_SUPABASE_URL) ? VPS_URL : env.VITE_SUPABASE_URL
  const supabaseAnonKey =
    !env.VITE_SUPABASE_ANON_KEY || isLegacySupabaseHost(env.VITE_SUPABASE_URL) ? VPS_ANON_KEY : env.VITE_SUPABASE_ANON_KEY
  const flowOpsUrl = env.VITE_FLOW_OPS_URL?.includes('supabase.co') || !env.VITE_FLOW_OPS_URL
    ? `${VPS_URL}/functions/v1/flow-ops`
    : env.VITE_FLOW_OPS_URL

  return {
    root: rendererRoot,
    envDir: mobileDir,
    publicDir: false,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'flow-mobile-html',
        transformIndexHtml(html) {
          return html
            .replace('<html lang="pt-BR" class="dark">', '<html lang="pt-BR" class="dark flow-mobile-shell">')
            .replace(
              /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
              `<meta http-equiv="Content-Security-Policy" content="default-src * data: blob: capacitor: https: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; connect-src *; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; font-src * data:;" />`
            )
            .replace(
              '</head>',
              `    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
    <meta name="theme-color" content="#111111" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  </head>`
            )
        }
      }
    ],
    define: {
      'import.meta.env.VITE_FLOW_SHELL': JSON.stringify('mobile'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey ?? ''),
      'import.meta.env.VITE_FLOW_OPS_URL': JSON.stringify(flowOpsUrl)
    },
    resolve: {
      alias: {
        '@': rendererSrc,
        '@capacitor/core': path.resolve(mobileModules, '@capacitor/core'),
        '@capacitor/preferences': path.resolve(mobileModules, '@capacitor/preferences'),
        '@capacitor/app': path.resolve(mobileModules, '@capacitor/app'),
        '@capacitor/filesystem': path.resolve(mobileModules, '@capacitor/filesystem'),
        '@capacitor/share': path.resolve(mobileModules, '@capacitor/share'),
        '@capacitor/screen-orientation': path.resolve(mobileModules, '@capacitor/screen-orientation'),
        '@capgo/capacitor-updater': path.resolve(mobileModules, '@capgo/capacitor-updater')
      },
      dedupe: ['react', 'react-dom', 'lucide-react', 'framer-motion']
    },
    optimizeDeps: {
      exclude: ['@capacitor/core', '@capacitor/preferences', '@capacitor/app', '@capacitor/filesystem', '@capacitor/share', '@capacitor/screen-orientation', '@capgo/capacitor-updater']
    },
    server: {
      port: 5174,
      host: true,
      fs: {
        allow: [repoRoot]
      }
    },
    build: {
      outDir: path.resolve(mobileDir, 'dist'),
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    }
  }
})
