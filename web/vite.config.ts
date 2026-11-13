import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { Scanner } from '@tailwindcss/oxide'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

/**
 * The web folder, spelled exactly as Windows stores it.
 *
 * On Windows the same folder can arrive as C:\... or c:\... depending on the
 * terminal. The bundler treats those as two different files, which once put two
 * copies of React in the build (the app crashed on start with "Cannot read
 * properties of null (reading 'useContext')"). Every path below starts from
 * this one canonical spelling.
 */
const WEB_ROOT = realpathSync.native(fileURLToPath(new URL('.', import.meta.url)))
const SRC = join(WEB_ROOT, 'src')

interface WebPackageJson {
  version: string
  tallybox: { minSupportedVersion: string }
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as WebPackageJson

/**
 * Writes /version.json into the build. The running app fetches it (never cached)
 * to learn whether a newer deploy exists and whether its own version is still
 * allowed. Raise `tallybox.minSupportedVersion` in package.json to force every
 * open or installed copy older than that to update.
 */
function versionFile(): Plugin {
  return {
    name: 'tallybox-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          version: pkg.version,
          minVersion: pkg.tallybox.minSupportedVersion,
        }),
      })
    },
  }
}

/**
 * Stops with a clear message if Tailwind cannot read the source files.
 *
 * Tailwind finds class names with a small native program. Windows Smart App
 * Control can block a freshly released copy of it, and Tailwind then falls back
 * to a WebAssembly version that cannot read Windows folders. The result is a
 * page with no styling and no error. This check turns that into an error.
 * See README > Troubleshooting. Tailwind is pinned to an exact version for the
 * same reason.
 */
function tailwindScannerCheck(): Plugin {
  return {
    name: 'tallybox-tailwind-scanner-check',
    buildStart() {
      if (process.env.VITEST) return
      const scanner = new Scanner({
        sources: [
          {
            base: SRC,
            pattern: '**/*.tsx',
            negated: false,
          },
        ],
      })
      if (scanner.scan().length > 0) return
      this.error(
        'Tailwind found no class names in web/src, so pages would have no styling. ' +
          "On Windows this usually means Smart App Control blocked Tailwind's scanner. " +
          'See README > Troubleshooting.',
      )
    },
  }
}

/**
 * Stops a build for real clients that would run on demo data. Their records
 * would live only in one browser and vanish. The app checks again when it
 * starts (src/main.tsx), and an end-to-end test proves this build fails.
 */
function releaseGuard(): Plugin {
  return {
    name: 'tallybox-release-guard',
    apply: 'build',
    configResolved(config) {
      const fileEnv = loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_')
      const read = (name: string) => process.env[name] ?? fileEnv[name] ?? ''
      const release = read('VITE_RELEASE').trim()
      const dataSource = read('VITE_DATA_SOURCE').trim() || 'mock'
      if (release === 'client' && dataSource !== 'supabase') {
        throw new Error(
          'A client release cannot use demo data. Set VITE_DATA_SOURCE=supabase, or build without VITE_RELEASE=client for a demo.',
        )
      }
    },
  }
}

export default defineConfig({
  // One .env.local at the repo root serves the whole project.
  root: WEB_ROOT,
  envDir: join(WEB_ROOT, '..'),
  resolve: {
    alias: {
      '@': SRC,
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    releaseGuard(),
    tailwindScannerCheck(),
    tailwindcss(),
    versionFile(),
    VitePWA({
      // 'prompt' = a new version waits until the user taps Refresh (see UpdatePrompt).
      registerType: 'prompt',
      // The service worker is registered from UpdatePrompt, so no inline script is needed.
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'Tallybox',
        short_name: 'Tallybox',
        description: 'Stock and sales for small businesses.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0E7C7B',
        background_color: '#0E7C7B',
        icons: [
          { src: '/brand/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/brand/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/brand/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell only. There is no runtimeCaching on purpose: API data is never cached.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', 'assets/inter-latin-wght-normal-*.woff2'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/version\.json$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    // Tests never use your real project settings, even if .env.local exists.
    env: {
      VITE_DATA_SOURCE: 'mock',
      VITE_RELEASE: '',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_TURNSTILE_SITE_KEY: '',
      VITE_STAFF_EMAIL_DOMAIN: '',
    },
    alias: {
      // The real module only exists inside a Vite build.
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/pwa-register-stub.ts', import.meta.url),
      ),
    },
  },
})
