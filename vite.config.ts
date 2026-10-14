import { defineConfig } from 'vitest/config'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { ResolvedConfig } from 'vite'


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

// The packaged app must allow the same API origin that its client uses.
// Otherwise a valid Railway/custom API URL is silently blocked by the browser.
function configuredApiCspPlugin() {
  let apiOrigin = '';
  return {
    name: 'configured-api-csp',
    configResolved(config: ResolvedConfig) {
      const value = config.env.VITE_API_BASE_URL;
      if (!value) return;
      const api = new URL(value);
      if (!['https:', 'http:'].includes(api.protocol)) throw new Error('API URL must use HTTP or HTTPS');
      apiOrigin = api.origin;
    },
    transformIndexHtml(html: string) {
      if (!apiOrigin) return html;
      return html.replace(/connect-src ([^;]+);/, (_match, sources: string) => {
        const origins = new Set(sources.trim().split(/\s+/));
        origins.add(apiOrigin);
        return `connect-src ${[...origins].join(' ')};`;
      });
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
    configuredApiCspPlugin(),
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
    // Compressed-size reporting duplicates every output chunk in memory and can
    // exhaust constrained CI/Windows runners. It does not affect built assets.
    reportCompressedSize: false,
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

  // Root unit tests cover the frontend (src).
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
