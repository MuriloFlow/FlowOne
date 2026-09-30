/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_FLOW_OPS_URL?: string
  readonly VITE_FLOW_SHELL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.png' {
  const src: string
  export default src
}

// Chunk do worker do pdf.js importado dinamicamente (sem tipos no pacote).
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  const worker: unknown
  export default worker
}

declare module '*.svg' {
  const src: string
  export default src
}
