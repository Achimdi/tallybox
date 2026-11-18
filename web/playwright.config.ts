import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const isCI = Boolean(process.env.CI)

/**
 * End-to-end tests run against the real production build (`vite preview`),
 * so they exercise the same files that get deployed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  // Chrome (Android phone and desktop), Firefox, and Safari's engine on an
  // iPhone. Windows Smart App Control can refuse to load a freshly downloaded
  // WebKit, so the iPhone run is on in CI (Linux) and locally only on request:
  // E2E_WEBKIT=1 npm run test:e2e
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    ...(isCI || process.env.E2E_WEBKIT
      ? [{ name: 'iphone', use: { ...devices['iPhone 14'] } }]
      : []),
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    // Always the demo data, whatever .env.local says: a variable set here wins
    // over the .env files, so switching your own copy to Supabase never breaks
    // these tests (or touches your real project).
    env: { VITE_DATA_SOURCE: 'mock' },
  },
})
