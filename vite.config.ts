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

// Remove the "noindex, nofollow" robots meta tag in production builds so
// search engines can index the live site. Dev/staging builds keep it blocked.
function robotsMetaPlugin() {
  return {
    name: 'robots-meta',
    transformIndexHtml(html: string) {
      if (process.env.VITE_APP_ENV === 'production') {
        return html.replace(
          /<meta name="robots" content="noindex, nofollow"\s*\/?>\s*\n?/g,
          '<meta name="robots" content="index, follow" />\n',
        );
      }
      return html;
    },
  };
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    robotsMetaPlugin(),
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
          // The Supabase client chunk is gone: the Edge Functions are retired
          // and nothing in the app imports supabase-js any more, so shipping it
          // would only give the bundle a way to reach a second backend.
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

  // Root unit tests cover the frontend (src).
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
