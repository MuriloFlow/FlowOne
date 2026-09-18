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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, mobileDir, 'VITE_')

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
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
      'import.meta.env.VITE_FLOW_OPS_URL': JSON.stringify(
        env.VITE_FLOW_OPS_URL ??
          `${String(env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/flow-ops`
      )
    },
    resolve: {
      alias: {
        '@': rendererSrc,
        '@capacitor/core': path.resolve(mobileModules, '@capacitor/core'),
        '@capacitor/preferences': path.resolve(mobileModules, '@capacitor/preferences'),
        '@capacitor/app': path.resolve(mobileModules, '@capacitor/app'),
        '@capgo/capacitor-updater': path.resolve(mobileModules, '@capgo/capacitor-updater')
      },
      dedupe: ['react', 'react-dom', 'lucide-react', 'framer-motion']
    },
    optimizeDeps: {
      exclude: ['@capacitor/core', '@capacitor/preferences', '@capacitor/app', '@capgo/capacitor-updater']
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
