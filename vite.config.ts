import { defineConfig } from 'vitest/config'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    target: 'es2020',
    // No source maps in the shipped bundle — keeps the fintech app's source
    // out of the public/native APK and reduces asset size.
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendor code into stable cached chunks
        // so app updates don't force users to re-download React/charts/etc.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },

  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },

  // Root unit tests only cover the frontend (src). The backend has its own
  // integration suite (backend/), which needs a dedicated throwaway Postgres
  // and is run separately via `npm test --prefix backend`.
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
