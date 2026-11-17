import { describe, it } from 'vitest'
import { DEFAULT_STAFF_EMAIL_DOMAIN } from '@/domain/rules'
import { describeAccountsContract } from '../contract/accounts.contract'
import type { TallyboxApi } from '../types'
import { memorySessionStorage } from './client'
import { createSupabaseApi } from './index'

/**
 * The shared contract tests, against the real Supabase dev project.
 * Run with `npm run test:live` (see vitest.live.config.ts for what it needs).
 */

const url = process.env.VITE_SUPABASE_URL ?? ''
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const developer = {
  email: process.env.TALLYBOX_LIVE_DEV_EMAIL ?? '',
  password: process.env.TALLYBOX_LIVE_DEV_PASSWORD ?? '',
}
const ready = Boolean(url && publishableKey && developer.email && developer.password)

/** A fresh "browser": its own signed-in person, kept in memory. */
function browser(): TallyboxApi {
  return createSupabaseApi({
    url,
    publishableKey,
    staffEmailDomain: DEFAULT_STAFF_EMAIL_DOMAIN,
    storage: memorySessionStorage(),
    // Cloudflare's dummy token: accepted only by the always-pass TEST secret on the dev project.
    fallbackCaptchaToken: 'XXXX.DUMMY.TOKEN.XXXX',
    deviceId: () => crypto.randomUUID(),
    isOnline: () => true,
  })
}

if (ready) {
  describeAccountsContract('supabase', () =>
    Promise.resolve({ api: browser(), otherBrowser: browser, developer }),
  )
} else {
  describe('live contract tests', () => {
    it.skip('need .env.local and .env.live.local (see vitest.live.config.ts)', () => undefined)
  })
}
