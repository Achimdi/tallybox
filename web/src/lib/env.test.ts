import { describe, expect, it } from 'vitest'
import { looksLikeSecretKey, parseEnv } from './env'

function fakeJwt(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('parseEnv', () => {
  it('reads the public settings', () => {
    expect(
      parseEnv({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
        VITE_TURNSTILE_SITE_KEY: '0x4AAA',
      }),
    ).toEqual({
      supabaseUrl: 'https://abc.supabase.co',
      supabasePublishableKey: 'sb_publishable_123',
      turnstileSiteKey: '0x4AAA',
    })
  })

  it('treats blank values as not set', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '  ' })).toEqual({
      supabaseUrl: undefined,
      supabasePublishableKey: undefined,
      turnstileSiteKey: undefined,
    })
  })

  it('rejects a URL that is not a web address', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: 'not a url' }).supabaseUrl).toBeUndefined()
  })
})

describe('looksLikeSecretKey', () => {
  it('spots secret keys so they are never used in the browser', () => {
    expect(looksLikeSecretKey('sb_secret_abc123')).toBe(true)
    expect(looksLikeSecretKey(fakeJwt({ role: 'service_role' }))).toBe(true)
  })

  it('allows public keys', () => {
    expect(looksLikeSecretKey('sb_publishable_abc123')).toBe(false)
    expect(looksLikeSecretKey(fakeJwt({ role: 'anon' }))).toBe(false)
    expect(looksLikeSecretKey('')).toBe(false)
  })
})
