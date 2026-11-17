// Unit tests for the Edge Functions. Run with:  npm run functions:test
//
// Each test calls the real function logic. The database, Supabase Auth and
// Cloudflare are replaced by small stand-ins, so nothing touches the network.

import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { Actor, AdminClient, Deps, LogEntry } from '../_shared/handler.ts'
import { handler as checkBusinessCode } from '../check-business-code/handler.ts'
import { handler as createOwnerResetLink } from '../create-owner-reset-link/handler.ts'
import { handler as createStaff } from '../create-staff/handler.ts'
import { handler as extendBusinessAccess } from '../extend-business-access/handler.ts'
import { handler as generateActivationCode } from '../generate-activation-code/handler.ts'
import { handler as registerBusiness } from '../register-business/handler.ts'
import { handler as resetStaffPassword } from '../reset-staff-password/handler.ts'
import { handler as revokeActivationCode } from '../revoke-activation-code/handler.ts'
import { handler as setBusinessStatus } from '../set-business-status/handler.ts'
import { handler as updateBusinessLogo } from '../update-business-logo/handler.ts'

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }
type RpcStub = (args: Record<string, unknown>) => RpcResult

interface World {
  deps: Deps
  /** Every call made to the outside, in order: "rpc:name", "createUser", "deleteUser", "turnstile". */
  calls: string[]
  rpcArgs: Record<string, Record<string, unknown>>
  createdUsers: { email: string; password: string; app_metadata: Record<string, unknown> }[]
  deletedUsers: string[]
  /** Recovery links asked for: who for, and where the link leads back to. */
  recoveryLinks: { email: string }[]
  passwordUpdates: { userId: string; password: string }[]
  uploads: { bucket: string; path: string; contentType: string; size: number }[]
  removed: string[]
  logs: LogEntry[]
}

interface WorldOptions {
  actor?: Actor | null
  rpc?: Record<string, RpcStub>
  createUserError?: string
  recoveryLinkError?: string
  passwordError?: string
  uploadFails?: boolean
  turnstileSuccess?: boolean
  env?: Record<string, string>
}

const ok = (data: unknown): RpcResult => ({ data, error: null })
const refuse = (code: string): RpcResult => ({
  data: null,
  error: { code: 'P0001', message: code },
})

const OWNER: Actor = { id: 'owner-1', appMetadata: { role: 'owner', business_id: 'biz-1' } }
const ADMIN: Actor = { id: 'admin-1', appMetadata: { role: 'super_admin' } }

function makeWorld(options: WorldOptions = {}): World {
  const world: World = {
    calls: [],
    rpcArgs: {},
    createdUsers: [],
    deletedUsers: [],
    recoveryLinks: [],
    passwordUpdates: [],
    uploads: [],
    removed: [],
    logs: [],
    deps: undefined as unknown as Deps,
  }

  const rpcStubs: Record<string, RpcStub> = {
    rate_limit_hit: () => ok(true),
    validate_activation_code: () => ok('ok'),
    business_code_available: () => ok(true),
    register_business: (args) => ok(args.p_business_id),
    staff_precheck: (args) =>
      ok({ business_id: 'biz-1', business_code: 'adas-pharmacy', username: args.p_username }),
    create_staff_profile: (args) => ok(args.p_staff_user_id),
    admin_generate_activation_code: () =>
      ok([
        {
          id: 'code-1',
          code: 'TB-7K4M-X9QD',
          owner_email: 'ada@shop.test',
          expires_at: '2026-11-18T00:00:00Z',
          access_days: 30,
        },
      ]),
    admin_extend_access: () => ok('2027-02-14T00:00:00Z'),
    admin_owner_email: () => ok('ada@shop.test'),
    admin_revoke_activation_code: () => ok(null),
    admin_set_business_status: () => ok(null),
    staff_reset_precheck: () => ok(null),
    owner_precheck: () => ok('biz-1'),
    set_business_logo: () => ok('biz-1/old-logo.png'),
    ...options.rpc,
  }

  const admin: AdminClient = {
    rpc(fn, args) {
      world.calls.push(`rpc:${fn}`)
      world.rpcArgs[fn] = args
      const stub = rpcStubs[fn]
      return Promise.resolve(stub ? stub(args) : { data: null, error: { code: '42883' } })
    },
    createUser(attributes) {
      world.calls.push('createUser')
      if (options.createUserError) {
        return Promise.resolve({ userId: null, errorCode: options.createUserError })
      }
      world.createdUsers.push(attributes)
      return Promise.resolve({ userId: `user-${world.createdUsers.length}`, errorCode: null })
    },
    deleteUser(userId) {
      world.calls.push('deleteUser')
      world.deletedUsers.push(userId)
      return Promise.resolve({ ok: true })
    },
    generateRecoveryToken(email) {
      world.calls.push('generateRecoveryToken')
      if (options.recoveryLinkError) {
        return Promise.resolve({ tokenHash: null, errorCode: options.recoveryLinkError })
      }
      world.recoveryLinks.push({ email })
      return Promise.resolve({ tokenHash: 'SECRET-TOKEN', errorCode: null })
    },
    updateUserPassword(userId, password) {
      world.calls.push('updateUserPassword')
      if (options.passwordError) return Promise.resolve({ errorCode: options.passwordError })
      world.passwordUpdates.push({ userId, password })
      return Promise.resolve({ errorCode: null })
    },
    uploadObject(bucket, path, bytes, contentType) {
      world.calls.push('uploadObject')
      if (options.uploadFails) return Promise.resolve({ ok: false })
      world.uploads.push({ bucket, path, contentType, size: bytes.length })
      return Promise.resolve({ ok: true })
    },
    removeObjects(_bucket, paths) {
      world.calls.push('removeObjects')
      world.removed.push(...paths)
      return Promise.resolve({ ok: true })
    },
  }

  const env: Record<string, string> = { TURNSTILE_SECRET_KEY: 'test-secret', ...options.env }

  world.deps = {
    admin,
    verifyUser: () => Promise.resolve(options.actor ?? null),
    fetch: (input) => {
      assertEquals(String(input), 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      world.calls.push('turnstile')
      return Promise.resolve(Response.json({ success: options.turnstileSuccess ?? true }))
    },
    env: (name) => env[name],
    log: (entry) => world.logs.push(entry),
  }
  return world
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/functions/v1/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: JSON.stringify(body),
  })
}

async function errorCode(response: Response): Promise<string> {
  const json = (await response.json()) as { error?: { code?: string } }
  return json.error?.code ?? '(no error)'
}

const REGISTRATION = {
  businessName: "Ada's Pharmacy",
  businessCode: ' Adas-Pharmacy ',
  ownerName: 'Ada Obi',
  email: ' Ada@Shop.test ',
  password: 'correct-horse-battery',
  phone: '',
  activationCode: 'tb-7k4m-x9qd',
  timezone: 'Africa/Lagos',
  turnstileToken: 'token',
}

// ---------------------------------------------------------------------------
// The frame: origins, methods, input
// ---------------------------------------------------------------------------

Deno.test('a browser from an unknown website is refused', async () => {
  const world = makeWorld()
  const response = await registerBusiness(
    post(REGISTRATION, { origin: 'https://evil.example' }),
    world.deps,
  )
  assertEquals(response.status, 403)
  assertEquals(await errorCode(response), 'origin_not_allowed')
  assertEquals(response.headers.get('access-control-allow-origin'), null)
  assertEquals(world.calls, [])
})

Deno.test('the app origin is allowed, including Cloudflare preview addresses', async () => {
  const world = makeWorld({
    env: { APP_ORIGINS: 'https://tallybox.pages.dev, https://*.tallybox.pages.dev' },
  })
  for (const origin of ['https://tallybox.pages.dev', 'https://a1b2c3.tallybox.pages.dev']) {
    const preflight = new Request('http://localhost/x', { method: 'OPTIONS', headers: { origin } })
    const response = await checkBusinessCode(preflight, world.deps)
    assertEquals(response.status, 204)
    assertEquals(response.headers.get('access-control-allow-origin'), origin)
  }
  for (const origin of [
    'https://tallybox.pages.dev.evil.example',
    'https://evil.example/.tallybox.pages.dev',
    'https://a.b.tallybox.pages.dev',
    'http://localhost:5173',
  ]) {
    const preflight = new Request('http://localhost/x', { method: 'OPTIONS', headers: { origin } })
    assertEquals((await checkBusinessCode(preflight, world.deps)).status, 403, origin)
  }
})

Deno.test('with no APP_ORIGINS set, only local development is allowed', async () => {
  const world = makeWorld()
  const response = await checkBusinessCode(
    post({ businessCode: 'adas-pharmacy' }, { origin: 'http://localhost:5173' }),
    world.deps,
  )
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

Deno.test('only POST is accepted', async () => {
  const world = makeWorld()
  const response = await checkBusinessCode(new Request('http://localhost/x'), world.deps)
  assertEquals(response.status, 405)
})

Deno.test('bad input is refused with field names and never with the values', async () => {
  const world = makeWorld()
  const response = await registerBusiness(
    post({ ...REGISTRATION, email: 'not-an-email', password: 'short', businessCode: 'a' }),
    world.deps,
  )
  assertEquals(response.status, 400)
  const text = await response.text()
  const json = JSON.parse(text) as { error: { code: string; fields: string[] } }
  assertEquals(json.error.code, 'validation')
  assertEquals(json.error.fields.sort(), ['businessCode', 'email', 'password'])
  assert(!text.includes('not-an-email') && !text.includes('short'))
  assertEquals(world.calls, [])
})

Deno.test('an oversized or broken body is refused', async () => {
  const world = makeWorld()
  const huge = await checkBusinessCode(post({ businessCode: 'x'.repeat(20_000) }), world.deps)
  assertEquals(huge.status, 413)
  const broken = new Request('http://localhost/x', { method: 'POST', body: '{not json' })
  assertEquals((await checkBusinessCode(broken, world.deps)).status, 400)
})

Deno.test('an unexpected database fault becomes a plain "server" error', async () => {
  const world = makeWorld({
    rpc: {
      business_code_available: () => ({
        data: null,
        error: { code: '42P01', message: 'relation "businesses" does not exist' },
      }),
    },
  })
  const response = await checkBusinessCode(post({ businessCode: 'adas-pharmacy' }), world.deps)
  assertEquals(response.status, 500)
  const text = await response.text()
  assertEquals(text, '{"error":{"code":"server"}}')
})

// ---------------------------------------------------------------------------
// register-business
// ---------------------------------------------------------------------------

Deno.test('registration creates the owner and the business in the right order', async () => {
  const world = makeWorld()
  const response = await registerBusiness(
    post(REGISTRATION, { 'x-device-id': 'device-1' }),
    world.deps,
  )

  assertEquals(response.status, 200)
  assertEquals(await response.json(), { data: { businessCode: 'adas-pharmacy' } })
  assertEquals(world.calls, [
    'rpc:rate_limit_hit',
    'rpc:rate_limit_hit',
    'rpc:rate_limit_hit',
    'turnstile',
    'rpc:validate_activation_code',
    'rpc:business_code_available',
    'createUser',
    'rpc:register_business',
  ])

  const user = world.createdUsers[0]!
  assertEquals(user.email, 'ada@shop.test')
  assertEquals(user.app_metadata.role, 'owner')

  const args = world.rpcArgs.register_business!
  assertEquals(args.p_business_id, user.app_metadata.business_id)
  assertEquals(args.p_owner_id, 'user-1')
  assertEquals(args.p_owner_email, 'ada@shop.test')
  assertEquals(args.p_business_code, 'adas-pharmacy')
  assertEquals(args.p_activation_code, 'TB7K4MX9QD')
  assertEquals(args.p_phone, null)
  assertEquals(args.p_timezone, 'Africa/Lagos')
  assertEquals(world.deletedUsers, [])
})

Deno.test('a bad activation code creates nothing', async () => {
  for (const code of [
    'activation_code_invalid',
    'activation_code_expired',
    'activation_code_used',
  ]) {
    const world = makeWorld({ rpc: { validate_activation_code: () => ok(code) } })
    const response = await registerBusiness(post(REGISTRATION), world.deps)
    assertEquals(response.status, 400)
    assertEquals(await errorCode(response), code)
    assert(!world.calls.includes('createUser'))
  }
})

Deno.test('a taken business code creates nothing', async () => {
  const world = makeWorld({ rpc: { business_code_available: () => ok(false) } })
  const response = await registerBusiness(post(REGISTRATION), world.deps)
  assertEquals(response.status, 409)
  assertEquals(await errorCode(response), 'business_code_taken')
  assert(!world.calls.includes('createUser'))
})

Deno.test('if the database step fails, the new Auth user is removed again', async () => {
  const world = makeWorld({ rpc: { register_business: () => refuse('business_code_taken') } })
  const response = await registerBusiness(post(REGISTRATION), world.deps)
  assertEquals(response.status, 409)
  assertEquals(await errorCode(response), 'business_code_taken')
  assertEquals(world.deletedUsers, ['user-1'])
})

Deno.test('an email that already has an account is reported clearly', async () => {
  const world = makeWorld({ createUserError: 'email_exists' })
  const response = await registerBusiness(post(REGISTRATION), world.deps)
  assertEquals(response.status, 409)
  assertEquals(await errorCode(response), 'email_taken')
  assert(!world.calls.includes('rpc:register_business'))
})

Deno.test('a failed Turnstile check stops registration before anything is looked up', async () => {
  const world = makeWorld({ turnstileSuccess: false })
  const response = await registerBusiness(post(REGISTRATION), world.deps)
  assertEquals(response.status, 400)
  assertEquals(await errorCode(response), 'captcha_failed')
  assert(!world.calls.includes('rpc:validate_activation_code'))
})

Deno.test('registration refuses to run without a Turnstile secret', async () => {
  const world = makeWorld({ env: { TURNSTILE_SECRET_KEY: '' } })
  const response = await registerBusiness(post(REGISTRATION), world.deps)
  assertEquals(response.status, 500)
  assertEquals(await errorCode(response), 'config_missing')
  assert(!world.calls.includes('createUser'))
})

Deno.test('too many attempts are refused before Turnstile or the database are asked', async () => {
  const world = makeWorld({ rpc: { rate_limit_hit: () => ok(false) } })
  const response = await registerBusiness(post(REGISTRATION), world.deps)
  assertEquals(response.status, 429)
  assertEquals(await errorCode(response), 'rate_limited')
  assertEquals(world.calls, ['rpc:rate_limit_hit'])
})

Deno.test('rate-limit keys are hashed, so the table holds no emails or IPs', async () => {
  const world = makeWorld()
  await registerBusiness(post(REGISTRATION), world.deps)
  const key = String(world.rpcArgs.rate_limit_hit!.p_key)
  assert(/^[0-9a-f]{64}$/.test(key))
})

Deno.test('logs never contain what the person typed', async () => {
  const world = makeWorld({
    rpc: { validate_activation_code: () => ok('activation_code_invalid') },
  })
  await registerBusiness(post(REGISTRATION), world.deps)
  const logged = JSON.stringify(world.logs)
  assert(logged.includes('activation_code_invalid'))
  for (const secret of ['ada@shop.test', 'correct-horse-battery', 'TB7K4MX9QD', 'Ada Obi']) {
    assert(!logged.includes(secret), secret)
  }
})

// ---------------------------------------------------------------------------
// check-business-code
// ---------------------------------------------------------------------------

Deno.test(
  'a badly formed business code is "not available" without asking the database',
  async () => {
    const world = makeWorld()
    const response = await checkBusinessCode(post({ businessCode: 'Admin' }), world.deps)
    assertEquals(await response.json(), { data: { available: false } })
    assert(!world.calls.includes('rpc:business_code_available'))
  },
)

Deno.test('a well formed business code is checked against the database', async () => {
  const world = makeWorld({ rpc: { business_code_available: () => ok(false) } })
  const response = await checkBusinessCode(post({ businessCode: 'Adas-Pharmacy' }), world.deps)
  assertEquals(await response.json(), { data: { available: false } })
  assertEquals(world.rpcArgs.business_code_available, { p_code: 'adas-pharmacy' })
})

// ---------------------------------------------------------------------------
// create-staff
// ---------------------------------------------------------------------------

const NEW_STAFF = { displayName: ' Chidi Eze ', username: ' Chidi ', password: 'temp-pass-123' }

Deno.test('creating staff needs a signed-in caller', async () => {
  const world = makeWorld({ actor: null })
  const response = await createStaff(post(NEW_STAFF), world.deps)
  assertEquals(response.status, 401)
  assertEquals(world.calls, [])
})

Deno.test('an owner creates a staff account with the made-up sign-in address', async () => {
  const world = makeWorld({ actor: OWNER })
  const response = await createStaff(post(NEW_STAFF), world.deps)

  assertEquals(response.status, 200)
  assertEquals(await response.json(), {
    data: { id: 'user-1', username: 'chidi', displayName: 'Chidi Eze' },
  })
  assertEquals(world.rpcArgs.staff_precheck, { p_owner_id: 'owner-1', p_username: 'chidi' })
  assertEquals(world.createdUsers[0], {
    email: 'chidi@adas-pharmacy.staff.tallybox.invalid',
    password: 'temp-pass-123',
    app_metadata: { role: 'staff', business_id: 'biz-1' },
  })
  assertEquals(world.rpcArgs.create_staff_profile, {
    p_owner_id: 'owner-1',
    p_staff_user_id: 'user-1',
    p_username: 'chidi',
    p_display_name: 'Chidi Eze',
  })
})

Deno.test('the database, not the token, decides who may create staff', async () => {
  // The token claims "owner", but the database says no.
  for (const [code, status] of [
    ['permission_denied', 403],
    ['business_suspended', 403],
    ['account_disabled', 403],
    ['username_taken', 409],
  ] as const) {
    const world = makeWorld({ actor: OWNER, rpc: { staff_precheck: () => refuse(code) } })
    const response = await createStaff(post(NEW_STAFF), world.deps)
    assertEquals(response.status, status)
    assertEquals(await errorCode(response), code)
    assert(!world.calls.includes('createUser'))
  }
})

Deno.test('if the staff profile cannot be saved, the Auth user is removed again', async () => {
  const world = makeWorld({
    actor: OWNER,
    rpc: { create_staff_profile: () => refuse('username_taken') },
  })
  const response = await createStaff(post(NEW_STAFF), world.deps)
  assertEquals(await errorCode(response), 'username_taken')
  assertEquals(world.deletedUsers, ['user-1'])
})

Deno.test('the staff email domain can be changed in one setting', async () => {
  const world = makeWorld({ actor: OWNER, env: { STAFF_EMAIL_DOMAIN: 'staff.example.com' } })
  await createStaff(post(NEW_STAFF), world.deps)
  assertEquals(world.createdUsers[0]!.email, 'chidi@adas-pharmacy.staff.staff.example.com')
})

// ---------------------------------------------------------------------------
// Super-admin functions
// ---------------------------------------------------------------------------

Deno.test('the super-admin generates a code and sees it once', async () => {
  const world = makeWorld({ actor: ADMIN })
  const response = await generateActivationCode(
    post({ ownerEmail: ' Ada@Shop.test ', note: " Ada's pharmacy " }),
    world.deps,
  )
  assertEquals(response.status, 200)
  assertEquals(await response.json(), {
    data: {
      id: 'code-1',
      code: 'TB-7K4M-X9QD',
      ownerEmail: 'ada@shop.test',
      expiresAt: '2026-11-18T00:00:00Z',
      accessDays: 30,
    },
  })
  // Left out, the code is redeemable for 7 days and gives 30 days of access.
  assertEquals(world.rpcArgs.admin_generate_activation_code, {
    p_actor_id: 'admin-1',
    p_owner_email: 'ada@shop.test',
    p_note: "Ada's pharmacy",
    p_expires_in_days: 7,
    p_access_days: 30,
  })
  assert(!JSON.stringify(world.logs).includes('TB-7K4M-X9QD'))
})

Deno.test('anyone else gets "not found" from the super-admin functions', async () => {
  const world = makeWorld({
    actor: OWNER,
    rpc: {
      admin_generate_activation_code: () => refuse('not_found'),
      admin_revoke_activation_code: () => refuse('not_found'),
      admin_set_business_status: () => refuse('not_found'),
    },
  })
  const uuid = '7d3f6f0e-58a1-4c1e-9d0a-1f2b3c4d5e6f'
  const responses = [
    await generateActivationCode(post({ ownerEmail: 'x@y.test' }), world.deps),
    await revokeActivationCode(post({ codeId: uuid }), world.deps),
    await setBusinessStatus(
      post({ businessId: uuid, status: 'suspended', reason: 'x' }),
      world.deps,
    ),
  ]
  for (const response of responses) {
    assertEquals(response.status, 404)
    assertEquals(await errorCode(response), 'not_found')
  }
  // The caller's id always comes from the verified token, never from the body.
  assertEquals(world.rpcArgs.admin_set_business_status!.p_actor_id, 'owner-1')
})

Deno.test('a suspension needs a reason, a reactivation does not', async () => {
  const world = makeWorld({ actor: ADMIN })
  const businessId = '7d3f6f0e-58a1-4c1e-9d0a-1f2b3c4d5e6f'

  const noReason = await setBusinessStatus(
    post({ businessId, status: 'suspended', reason: '  ' }),
    world.deps,
  )
  assertEquals(noReason.status, 400)
  assert(!world.calls.includes('rpc:admin_set_business_status'))

  const suspend = await setBusinessStatus(
    post({ businessId, status: 'suspended', reason: 'Unpaid' }),
    world.deps,
  )
  assertEquals(await suspend.json(), { data: { status: 'suspended' } })

  const reactivate = await setBusinessStatus(post({ businessId, status: 'active' }), world.deps)
  assertEquals(reactivate.status, 200)
  assertEquals(world.rpcArgs.admin_set_business_status, {
    p_actor_id: 'admin-1',
    p_business_id: businessId,
    p_status: 'active',
    p_reason: null,
  })
})

Deno.test('revoking a code passes on what the database says', async () => {
  const codeId = '7d3f6f0e-58a1-4c1e-9d0a-1f2b3c4d5e6f'
  const fine = makeWorld({ actor: ADMIN })
  assertEquals((await revokeActivationCode(post({ codeId }), fine.deps)).status, 200)

  const used = makeWorld({
    actor: ADMIN,
    rpc: { admin_revoke_activation_code: () => refuse('conflict') },
  })
  assertEquals((await revokeActivationCode(post({ codeId }), used.deps)).status, 409)

  const badId = makeWorld({ actor: ADMIN })
  assertEquals((await revokeActivationCode(post({ codeId: 'nope' }), badId.deps)).status, 400)
})

Deno.test('a code carries the access length the super-admin chose, or none at all', async () => {
  const year = makeWorld({ actor: ADMIN })
  await generateActivationCode(post({ ownerEmail: 'ada@shop.test', accessDays: 365 }), year.deps)
  assertEquals(year.rpcArgs.admin_generate_activation_code?.p_access_days, 365)

  // Null means open-ended, and must reach the database as null, not as the default.
  const open = makeWorld({ actor: ADMIN })
  await generateActivationCode(post({ ownerEmail: 'ada@shop.test', accessDays: null }), open.deps)
  assertEquals(open.rpcArgs.admin_generate_activation_code?.p_access_days, null)

  for (const accessDays of [0, 1.5, 3651, '30']) {
    const bad = makeWorld({ actor: ADMIN })
    const response = await generateActivationCode(
      post({ ownerEmail: 'ada@shop.test', accessDays }),
      bad.deps,
    )
    assertEquals(response.status, 400)
    assert(!bad.calls.includes('rpc:admin_generate_activation_code'))
  }
})

Deno.test('the super-admin extends access by days, or makes it open-ended', async () => {
  const businessId = '7d3f6f0e-58a1-4c1e-9d0a-1f2b3c4d5e6f'
  const world = makeWorld({ actor: ADMIN })
  const response = await extendBusinessAccess(post({ businessId, days: 90 }), world.deps)
  assertEquals(await response.json(), { data: { accessEndsAt: '2027-02-14T00:00:00Z' } })
  assertEquals(world.rpcArgs.admin_extend_access, {
    p_actor_id: 'admin-1',
    p_business_id: businessId,
    p_days: 90,
  })

  const open = makeWorld({ actor: ADMIN, rpc: { admin_extend_access: () => ok(null) } })
  const openEnded = await extendBusinessAccess(post({ businessId, days: null }), open.deps)
  assertEquals(await openEnded.json(), { data: { accessEndsAt: null } })
  assertEquals(open.rpcArgs.admin_extend_access?.p_days, null)

  // Days must be given (a number or null), whole and in range.
  for (const body of [{ businessId }, { businessId, days: 0 }, { businessId, days: 4000 }]) {
    const bad = makeWorld({ actor: ADMIN })
    assertEquals((await extendBusinessAccess(post(body), bad.deps)).status, 400)
    assert(!bad.calls.includes('rpc:admin_extend_access'))
  }

  const signedOut = makeWorld({ actor: null })
  assertEquals(
    (await extendBusinessAccess(post({ businessId, days: 30 }), signedOut.deps)).status,
    401,
  )
  const owner = makeWorld({ actor: OWNER, rpc: { admin_extend_access: () => refuse('not_found') } })
  assertEquals((await extendBusinessAccess(post({ businessId, days: 30 }), owner.deps)).status, 404)
})

Deno.test(
  'the super-admin gets a one-time reset link for an owner, and it is never logged',
  async () => {
    const businessId = '7d3f6f0e-58a1-4c1e-9d0a-1f2b3c4d5e6f'
    const world = makeWorld({
      actor: ADMIN,
      env: { APP_ORIGINS: 'https://tallybox.pages.dev,https://*.tallybox.pages.dev' },
    })
    const response = await createOwnerResetLink(
      post({ businessId }, { origin: 'https://tallybox.pages.dev' }),
      world.deps,
    )
    assertEquals(response.status, 200)
    const { data } = (await response.json()) as {
      data: { url: string; ownerEmail: string; expiresAt: string }
    }
    // The app's own page, on the address the request came from, which spends
    // the code only when the owner taps Continue (so link previews can't).
    assertEquals(data.url, 'https://tallybox.pages.dev/reset-password?token=SECRET-TOKEN')
    assertEquals(data.ownerEmail, 'ada@shop.test')
    assert(new Date(data.expiresAt).getTime() > Date.now())

    assertEquals(world.recoveryLinks, [{ email: 'ada@shop.test' }])
    assertEquals(world.rpcArgs.admin_owner_email, {
      p_actor_id: 'admin-1',
      p_business_id: businessId,
    })
    // Neither the link nor the email reaches the logs.
    assert(!JSON.stringify(world.logs).includes('SECRET-TOKEN'))
    assert(!JSON.stringify(world.logs).includes('ada@shop.test'))
  },
)

Deno.test('nobody but the super-admin gets a reset link, and never from another site', async () => {
  const businessId = '7d3f6f0e-58a1-4c1e-9d0a-1f2b3c4d5e6f'

  // The database says "not found" to anyone who is not the super-admin: no link is made.
  const owner = makeWorld({ actor: OWNER, rpc: { admin_owner_email: () => refuse('not_found') } })
  assertEquals((await createOwnerResetLink(post({ businessId }), owner.deps)).status, 404)
  assert(!owner.calls.includes('generateRecoveryToken'))

  const signedOut = makeWorld({ actor: null })
  assertEquals((await createOwnerResetLink(post({ businessId }), signedOut.deps)).status, 401)

  // A request from a site that is not the app is refused before anything happens.
  const elsewhere = makeWorld({
    actor: ADMIN,
    env: { APP_ORIGINS: 'https://tallybox.pages.dev' },
  })
  const response = await createOwnerResetLink(
    post({ businessId }, { origin: 'https://evil.example' }),
    elsewhere.deps,
  )
  assertEquals(response.status, 403)
  assertEquals(elsewhere.calls, [])

  // Too many links in an hour: refused.
  const limited = makeWorld({ actor: ADMIN, rpc: { rate_limit_hit: () => ok(false) } })
  assertEquals((await createOwnerResetLink(post({ businessId }), limited.deps)).status, 429)
  assert(!limited.calls.includes('generateRecoveryToken'))

  // If Supabase Auth cannot make the link, say so safely.
  const broken = makeWorld({ actor: ADMIN, recoveryLinkError: 'user_not_found' })
  assertEquals((await createOwnerResetLink(post({ businessId }), broken.deps)).status, 500)
})

Deno.test(
  'the per-IP registration limit can be raised for a dev project, never lowered',
  async () => {
    const limits: number[] = []
    const track = (env: Record<string, string>) =>
      makeWorld({
        env,
        rpc: {
          rate_limit_hit: (args) => {
            if (String(args.p_key).length > 0) limits.push(Number(args.p_max))
            return ok(true)
          },
        },
      })
    const body = {
      businessName: "Ada's Pharmacy",
      businessCode: 'adas-pharmacy',
      ownerName: 'Ada Eze',
      email: 'ada@shop.test',
      password: 'long-password-1',
      phone: '',
      activationCode: 'TB-7K4M-X9QD',
      turnstileToken: 'token',
    }
    await registerBusiness(post(body), track({ REGISTER_IP_LIMIT: '200' }).deps)
    assertEquals(limits[0], 200)
    limits.length = 0
    await registerBusiness(post(body), track({ REGISTER_IP_LIMIT: '3' }).deps)
    assertEquals(limits[0], 10)
    limits.length = 0
    await registerBusiness(post(body), track({}).deps)
    assertEquals(limits[0], 10)
  },
)

// ---------------------------------------------------------------------------
// reset-staff-password
// ---------------------------------------------------------------------------

const STAFF_ID = '5e1f0000-0000-4000-8000-000000000001'

Deno.test('an owner sets a new password for their staff member, never logged', async () => {
  const world = makeWorld({ actor: OWNER })
  const response = await resetStaffPassword(
    post({ staffId: STAFF_ID, newPassword: 'second-pass-2' }),
    world.deps,
  )
  assertEquals(response.status, 200)
  assertEquals(world.rpcArgs.staff_reset_precheck, { p_owner_id: 'owner-1', p_staff_id: STAFF_ID })
  assertEquals(world.passwordUpdates, [{ userId: STAFF_ID, password: 'second-pass-2' }])
  assert(!JSON.stringify(world.logs).includes('second-pass-2'))
})

Deno.test('a short password is weak, and nothing changes', async () => {
  const world = makeWorld({ actor: OWNER })
  const response = await resetStaffPassword(
    post({ staffId: STAFF_ID, newPassword: 'short' }),
    world.deps,
  )
  assertEquals(await errorCode(response), 'weak_password')
  assertEquals(world.passwordUpdates, [])
})

Deno.test('the database decides whose password an owner may reset', async () => {
  for (const [code, status] of [
    ['not_found', 404],
    ['permission_denied', 403],
    ['business_suspended', 403],
  ] as const) {
    const world = makeWorld({ actor: OWNER, rpc: { staff_reset_precheck: () => refuse(code) } })
    const response = await resetStaffPassword(
      post({ staffId: STAFF_ID, newPassword: 'second-pass-2' }),
      world.deps,
    )
    assertEquals(response.status, status)
    assertEquals(await errorCode(response), code)
    assertEquals(world.passwordUpdates, [])
  }
})

Deno.test('resetting a password needs a signed-in caller', async () => {
  const world = makeWorld({ actor: null })
  const response = await resetStaffPassword(
    post({ staffId: STAFF_ID, newPassword: 'second-pass-2' }),
    world.deps,
  )
  assertEquals(await errorCode(response), 'unauthenticated')
  assertEquals(world.calls, [])
})

// ---------------------------------------------------------------------------
// update-business-logo
// ---------------------------------------------------------------------------

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=='

function dataUrl(type: string, bytes: number[], padTo = 0): string {
  const all = [...bytes, ...Array<number>(Math.max(0, padTo - bytes.length)).fill(0)]
  return `data:${type};base64,${btoa(String.fromCharCode(...all))}`
}

Deno.test('an owner saves a logo in their own folder, and the old one is removed', async () => {
  const world = makeWorld({ actor: OWNER })
  const response = await updateBusinessLogo(post({ logo: TINY_PNG }), world.deps)
  assertEquals(response.status, 200)

  const [upload] = world.uploads
  assertEquals(upload?.bucket, 'logos')
  assertEquals(upload?.contentType, 'image/png')
  assert(/^biz-1\/[0-9a-f-]{36}\.png$/.test(upload!.path), 'a new random name under the business')
  assertEquals(world.rpcArgs.set_business_logo, {
    p_owner_id: 'owner-1',
    p_logo_path: upload!.path,
  })
  assertEquals(world.removed, ['biz-1/old-logo.png'])
  assertEquals(await response.json(), { data: { logoPath: upload!.path } })
})

Deno.test('a logo larger than the usual 10 KB body still arrives', async () => {
  const world = makeWorld({ actor: OWNER })
  const big = dataUrl('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 60_000)
  const response = await updateBusinessLogo(post({ logo: big }), world.deps)
  assertEquals(response.status, 200)
  assertEquals(world.uploads[0]?.size, 60_000)
})

Deno.test('removing the logo stores nothing and deletes the old file', async () => {
  const world = makeWorld({ actor: OWNER })
  const response = await updateBusinessLogo(post({ logo: null }), world.deps)
  assertEquals(response.status, 200)
  assertEquals(world.uploads, [])
  assertEquals(world.rpcArgs.set_business_logo, { p_owner_id: 'owner-1', p_logo_path: null })
  assertEquals(world.removed, ['biz-1/old-logo.png'])
})

Deno.test('anything but a small real picture is refused before it is stored', async () => {
  const jpegBytes = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (const logo of [
    'not-an-image',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    dataUrl('image/png', jpegBytes), // says PNG, is a JPEG
    dataUrl('image/gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]),
  ]) {
    const world = makeWorld({ actor: OWNER })
    const response = await updateBusinessLogo(post({ logo }), world.deps)
    assertEquals(await errorCode(response), 'validation', logo.slice(0, 30))
    assertEquals(world.uploads, [])
    assert(!world.calls.includes('rpc:set_business_logo'))
  }
  // A real JPEG is fine.
  const world = makeWorld({ actor: OWNER })
  const response = await updateBusinessLogo(
    post({ logo: dataUrl('image/jpeg', jpegBytes) }),
    world.deps,
  )
  assertEquals(response.status, 200)
  assert(world.uploads[0]!.path.endsWith('.jpg'))
})

Deno.test('only an owner of a business with access may change its logo', async () => {
  const world = makeWorld({
    actor: OWNER,
    rpc: { owner_precheck: () => refuse('permission_denied') },
  })
  const response = await updateBusinessLogo(post({ logo: TINY_PNG }), world.deps)
  assertEquals(await errorCode(response), 'permission_denied')
  assertEquals(world.uploads, [])
})

Deno.test('a logo the database refuses is not left behind in Storage', async () => {
  const world = makeWorld({
    actor: OWNER,
    rpc: { set_business_logo: () => refuse('business_suspended') },
  })
  const response = await updateBusinessLogo(post({ logo: TINY_PNG }), world.deps)
  assertEquals(await errorCode(response), 'business_suspended')
  assertEquals(world.removed, [world.uploads[0]!.path])
})

Deno.test('a failed upload changes nothing', async () => {
  const world = makeWorld({ actor: OWNER, uploadFails: true })
  const response = await updateBusinessLogo(post({ logo: TINY_PNG }), world.deps)
  assertEquals(await errorCode(response), 'server')
  assert(!world.calls.includes('rpc:set_business_logo'))
})
