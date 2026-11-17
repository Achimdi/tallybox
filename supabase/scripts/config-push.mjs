// Pushes supabase/config.toml to a hosted project, safely.
//
//   npm run config:push                         tallybox-dev (the linked project)
//   npm run config:push -- --remote=<prod-ref>  production
//
// Sign-in is protected by Cloudflare Turnstile, checked by Supabase Auth
// (auth.captcha in config.toml). Its secret is never written in the repo:
// config.toml reads it from SUPABASE_AUTH_CAPTCHA_SECRET. Pushing without it
// would switch the check on with no valid secret and lock everyone out, so
// this script refuses unless it has one:
//
//   - tallybox-dev uses Cloudflare's published always-pass TEST secret.
//   - Production reads TURNSTILE_SECRET_KEY from .env.prod-secrets.local in the
//     repo root (gitignored), which only the developer fills in. It is never
//     printed.
//
// The Supabase CLI still shows the changes and asks before writing anything.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_SECRET = '1x0000000000000000000000000000000AA'
const SECRETS_FILE = join(import.meta.dirname, '..', '..', '.env.prod-secrets.local')

const args = process.argv.slice(2)
const production = args.some((arg) => arg.startsWith('--remote='))

function readSecret() {
  if (!existsSync(SECRETS_FILE)) return ''
  for (const line of readFileSync(SECRETS_FILE, 'utf8').split(/\r?\n/)) {
    const match = /^\s*TURNSTILE_SECRET_KEY\s*=\s*(.*?)\s*$/.exec(line)
    if (match) return match[1].replace(/^["']|["']$/g, '')
  }
  return ''
}

let secret = process.env.SUPABASE_AUTH_CAPTCHA_SECRET ?? ''
if (!secret) secret = production ? readSecret() : TEST_SECRET

if (!secret) {
  console.error(
    'Refusing to push: no Turnstile secret for sign-in. Put TURNSTILE_SECRET_KEY=... in ' +
      '.env.prod-secrets.local (repo root, gitignored), then run this again.',
  )
  process.exit(1)
}
if (production && secret === TEST_SECRET) {
  console.error('Refusing to push: production must not use the always-pass TEST secret.')
  process.exit(1)
}

const result = spawnSync('npx', ['supabase', 'config', 'push', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SUPABASE_AUTH_CAPTCHA_SECRET: secret },
})
process.exit(result.status ?? 1)
