import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Runs the shared contract tests against the REAL Supabase dev project.
 *
 *   npm run test:live
 *
 * Needs, in the repo root (both files are gitignored):
 *   .env.local       VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
 *   .env.live.local  TALLYBOX_LIVE_DEV_EMAIL and TALLYBOX_LIVE_DEV_PASSWORD
 *                    (the developer's own super-admin sign-in)
 *
 * It creates test businesses and accounts in the dev project (names start with
 * "Contract", emails end in @contract.test). Never point it at a project with
 * real clients.
 */
const WEB_ROOT = realpathSync.native(fileURLToPath(new URL('.', import.meta.url)))
const fileEnv = loadEnv('live', join(WEB_ROOT, '..'), '')

export default defineConfig({
  resolve: { alias: { '@': join(WEB_ROOT, 'src') } },
  test: {
    root: WEB_ROOT,
    environment: 'node',
    include: ['src/api/supabase/live.contract.ts'],
    // One shared project and real network: one test at a time, with time to answer.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      VITE_SUPABASE_URL: fileEnv.VITE_SUPABASE_URL ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      TALLYBOX_LIVE_DEV_EMAIL: fileEnv.TALLYBOX_LIVE_DEV_EMAIL ?? '',
      TALLYBOX_LIVE_DEV_PASSWORD: fileEnv.TALLYBOX_LIVE_DEV_PASSWORD ?? '',
    },
  },
})
