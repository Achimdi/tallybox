import {
  accessEndFromCode,
  accessFilterFor,
  businessAccessState,
  extendAccessEnd,
  isValidAccessDays,
} from '@/domain/access'
import {
  codeProblem,
  codeStatus,
  hashActivationCode,
  isValidRedeemDays,
  newActivationCode,
  REGISTER_ATTEMPTS_PER_HOUR,
  redeemByFromDays,
} from '@/domain/activationCodes'
import { hitRateLimit, type RateCounters } from '@/domain/rateLimit'
import {
  isValidBusinessCode,
  isValidUsername,
  isWellFormedActivationCode,
  LIMITS,
  normalizeBusinessCode,
  normalizeUsername,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from '@/domain/rules'
import { isValidTimeZone } from '@/lib/dates'
import { deviceId as browserDeviceId } from '@/lib/device'
import { AppError, type AppErrorCode } from '@/lib/errors'
import type {
  AdminBusiness,
  AdminBusinessDetail,
  BlockedNotice,
  SessionResult,
  SessionUser,
  StaffMember,
  TallyboxApi,
} from '../types'
import { hashPassword, newSalt, passwordMatches } from './passwords'
import { createSeed, DEMO_ACCOUNTS } from './seed'
import {
  browserStorage,
  MockStore,
  type KeyValueStorage,
  type MockBusiness,
  type MockDb,
  type MockUser,
} from './store'

/**
 * The Phase 1 implementation of TallyboxApi: demo data kept in this browser.
 *
 * It enforces the same rules the real backend will (and passes the same
 * contract tests), so the screens built on it need no change in Phase 2.
 * Each browser tab has its own signed-in person, while the data is shared by
 * all tabs, so the developer can act in one tab and see an owner's tab react.
 */

export interface MockApiOptions {
  /** Where the demo data lives. Default: localStorage. */
  storage?: KeyValueStorage
  /** Where this tab's signed-in person is remembered. Default: sessionStorage. */
  sessionStorage?: KeyValueStorage
  /** Pretend network delay, so loading states are visible. Default 250 ms. */
  delayMs?: number
  now?: () => Date
  isOnline?: () => boolean
  deviceId?: () => string
  seed?: (now: Date) => Promise<MockDb>
}

const SESSION_KEY = 'tb.demo.session'
const SIGN_IN_FAILURES_PER_15_MIN = 10
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function fail(code: AppErrorCode, details?: Record<string, unknown>): never {
  throw new AppError(code, details ? { details } : {})
}

function tabStorage(): KeyValueStorage {
  const get = (): Storage | null => {
    try {
      return window.sessionStorage
    } catch {
      return null
    }
  }
  const memory = new Map<string, string>()
  return {
    get: (key) => {
      try {
        return get()?.getItem(key) ?? memory.get(key) ?? null
      } catch {
        return memory.get(key) ?? null
      }
    },
    set: (key, value) => {
      try {
        get()?.setItem(key, value)
      } catch {
        // Fall through to memory.
      }
      memory.set(key, value)
    },
    remove: (key) => {
      try {
        get()?.removeItem(key)
      } catch {
        // Nothing to do.
      }
      memory.delete(key)
    },
  }
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').trim().replace(/\s+/g, ' ')
  return cleaned === '' ? null : cleaned
}

function isLimited(
  counters: RateCounters,
  key: string,
  max: number,
  windowMs: number,
  nowMs: number,
) {
  const current = counters[key]
  return (
    current !== undefined &&
    current.windowStart === Math.floor(nowMs / windowMs) * windowMs &&
    current.count >= max
  )
}

export function createMockApi(options: MockApiOptions = {}): TallyboxApi {
  const now = options.now ?? (() => new Date())
  const delayMs = options.delayMs ?? 250
  const isOnline = options.isOnline ?? (() => navigator.onLine)
  const getDeviceId = options.deviceId ?? browserDeviceId
  const sessions = options.sessionStorage ?? tabStorage()
  const store = new MockStore(options.storage ?? browserStorage(), () =>
    (options.seed ?? createSeed)(now()),
  )

  // --- Plumbing ------------------------------------------------------------

  /** Every call starts here: a short pause, the network check, the latest data. */
  async function begin(): Promise<MockDb> {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (!isOnline()) fail('offline')
    return store.read()
  }

  const signedInUserId = () => sessions.get(SESSION_KEY)
  const setSignedIn = (userId: string | null) =>
    userId ? sessions.set(SESSION_KEY, userId) : sessions.remove(SESSION_KEY)

  const businessOf = (db: MockDb, id: string | null) =>
    id ? db.businesses.find((business) => business.id === id) : undefined

  const accessFacts = (business: MockBusiness) => ({
    status: business.status,
    accessEndsAt: business.accessEndsAt,
  })

  /** Decides, live, whether this person may use the app, and as whom. */
  function sessionFor(db: MockDb, user: MockUser): SessionResult {
    if (user.role === 'super_admin') {
      return {
        kind: 'user',
        user: {
          id: user.id,
          role: 'super_admin',
          displayName: user.displayName,
          email: user.email,
          username: null,
          businessId: null,
          businessName: null,
          businessCode: null,
          currencyCode: null,
          timezone: null,
          accessEndsAt: null,
        },
      }
    }

    const business = businessOf(db, user.businessId)
    if (!business) {
      return {
        kind: 'blocked',
        notice: { reason: 'no_profile', businessName: null, accessEndedAt: null },
      }
    }

    const notice = (reason: BlockedNotice['reason']): SessionResult => ({
      kind: 'blocked',
      notice: {
        reason,
        businessName: business.name,
        accessEndedAt: reason === 'access_ended' ? business.accessEndsAt : null,
      },
    })

    // A business-wide block is reported before a turned-off account.
    const access = businessAccessState(accessFacts(business), now())
    if (access === 'suspended') return notice('suspended')
    if (access === 'ended') return notice('access_ended')
    if (!user.active) return notice('disabled')

    const sessionUser: SessionUser = {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      email: user.email,
      username: user.username,
      businessId: business.id,
      businessName: business.name,
      businessCode: business.businessCode,
      currencyCode: business.currencyCode,
      timezone: business.timezone,
      accessEndsAt: business.accessEndsAt,
    }
    return { kind: 'user', user: sessionUser }
  }

  const BLOCKED_CODE: Record<BlockedNotice['reason'], AppErrorCode> = {
    suspended: 'business_suspended',
    access_ended: 'access_ended',
    disabled: 'account_disabled',
    no_profile: 'permission_denied',
  }

  /** The signed-in member, checked live. Stops if they may not do this right now. */
  function requireMember(db: MockDb, roles: readonly ('owner' | 'staff')[]) {
    const user = db.users.find((candidate) => candidate.id === signedInUserId())
    if (!user) fail('unauthenticated')
    const result = sessionFor(db, user)
    if (result.kind === 'blocked') fail(BLOCKED_CODE[result.notice.reason])
    if (result.user.role === 'super_admin' || !roles.includes(result.user.role)) {
      fail('permission_denied')
    }
    return { user, business: businessOf(db, user.businessId)! }
  }

  /** The developer portal answers "not found" to everyone else, so it stays hidden. */
  function requireDeveloper(db: MockDb): MockUser {
    const user = db.users.find((candidate) => candidate.id === signedInUserId())
    if (!user || user.role !== 'super_admin') fail('not_found')
    return user
  }

  function toStaffMember(user: MockUser): StaffMember {
    return {
      id: user.id,
      displayName: user.displayName,
      username: user.username ?? '',
      active: user.active,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }
  }

  function toAdminBusiness(db: MockDb, business: MockBusiness): AdminBusiness {
    const people = db.users.filter((user) => user.businessId === business.id)
    const owner = people.find((user) => user.id === business.ownerId)
    const lastActivity = people
      .map((user) => user.lastLoginAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1)
    return {
      id: business.id,
      name: business.name,
      businessCode: business.businessCode,
      status: business.status,
      accessEndsAt: business.accessEndsAt,
      accessFilter: accessFilterFor(accessFacts(business), now()),
      createdAt: business.createdAt,
      ownerName: owner?.displayName ?? null,
      ownerEmail: owner?.email ?? null,
      staffCount: people.filter((user) => user.role === 'staff').length,
      lastActivityAt: lastActivity ?? null,
      suspendedAt: business.suspendedAt,
      suspendedReason: business.suspendedReason,
    }
  }

  /** Counts a failed attempt. Returns false once the limit is passed. */
  function countFailure(db: MockDb, key: string, max: number, windowMs: number): boolean {
    const result = hitRateLimit(db.rateLimits, key, max, windowMs, now().getTime())
    db.rateLimits = result.counters
    store.write(db)
    return result.allowed
  }

  // --- The API -------------------------------------------------------------

  const api: TallyboxApi = {
    source: 'mock',
    requiresCaptcha: false,

    auth: {
      async signIn(input) {
        const db = await begin()
        const key = `sign-in:device:${getDeviceId()}`
        const nowMs = now().getTime()
        if (isLimited(db.rateLimits, key, SIGN_IN_FAILURES_PER_15_MIN, 15 * MINUTE, nowMs)) {
          fail('rate_limited')
        }

        let user: MockUser | undefined
        if (input.portal === 'owner') {
          const email = input.email.trim().toLowerCase()
          user = db.users.find(
            (candidate) => candidate.email === email && candidate.role !== 'staff',
          )
        } else {
          const business = db.businesses.find(
            (candidate) => candidate.businessCode === normalizeBusinessCode(input.businessCode),
          )
          const username = normalizeUsername(input.username)
          user = business
            ? db.users.find(
                (candidate) =>
                  candidate.businessId === business.id &&
                  candidate.role === 'staff' &&
                  candidate.username === username,
              )
            : undefined
        }

        const correct =
          user !== undefined &&
          (await passwordMatches(input.password, user.passwordSalt, user.passwordHash))
        if (!user || !correct) {
          const allowed = countFailure(db, key, SIGN_IN_FAILURES_PER_15_MIN, 15 * MINUTE)
          // One answer for every wrong detail, so nothing can be discovered.
          fail(allowed ? 'invalid_credentials' : 'rate_limited')
        }

        const result = sessionFor(db, user)
        if (result.kind === 'blocked') {
          setSignedIn(null)
          return result
        }

        user.lastLoginAt = now().toISOString()
        store.write(db)
        setSignedIn(user.id)
        return result
      },

      async getSession() {
        const userId = signedInUserId()
        if (!userId) return null
        const db = await begin()
        const user = db.users.find((candidate) => candidate.id === userId)
        if (!user) {
          setSignedIn(null)
          return null
        }
        const result = sessionFor(db, user)
        if (result.kind === 'blocked') setSignedIn(null)
        return result
      },

      async signOut() {
        setSignedIn(null)
        return Promise.resolve()
      },
    },

    registration: {
      async isBusinessCodeAvailable(businessCode) {
        const db = await begin()
        const code = normalizeBusinessCode(businessCode)
        if (!isValidBusinessCode(code)) return false
        return !db.businesses.some((business) => business.businessCode === code)
      },

      async registerBusiness(input) {
        const db = await begin()
        const email = input.email.trim().toLowerCase()
        const businessCode = normalizeBusinessCode(input.businessCode)
        const businessName = cleanText(input.businessName)
        const ownerName = cleanText(input.ownerName)
        const phone = cleanText(input.phone)

        // Repeated wrong codes are limited per device and per email.
        const keys = [`register:device:${getDeviceId()}`, `register:email:${email}`]
        if (
          keys.some((key) =>
            isLimited(db.rateLimits, key, REGISTER_ATTEMPTS_PER_HOUR, HOUR, now().getTime()),
          )
        ) {
          fail('rate_limited')
        }

        if (
          !businessName ||
          businessName.length < LIMITS.businessNameMin ||
          businessName.length > LIMITS.businessNameMax ||
          !ownerName ||
          ownerName.length > LIMITS.displayNameMax ||
          !EMAIL_PATTERN.test(email) ||
          email.length > LIMITS.emailMax ||
          input.password.length < PASSWORD_MIN ||
          input.password.length > PASSWORD_MAX ||
          (phone?.length ?? 0) > LIMITS.phoneMax
        ) {
          fail('validation')
        }
        if (!isValidBusinessCode(businessCode)) fail('business_code_invalid')

        const codeHash = await hashActivationCode(input.activationCode)
        const activation = isWellFormedActivationCode(input.activationCode)
          ? db.activationCodes.find((candidate) => candidate.codeHash === codeHash)
          : undefined

        const problem = codeProblem(activation, email, now())
        if (problem) {
          const allowed = keys
            .map((key) => countFailure(db, key, REGISTER_ATTEMPTS_PER_HOUR, HOUR))
            .every(Boolean)
          fail(allowed ? problem : 'rate_limited')
        }

        if (db.businesses.some((business) => business.businessCode === businessCode)) {
          fail('business_code_taken')
        }
        if (db.users.some((user) => user.email === email)) fail('email_taken')

        const stamp = now().toISOString()
        const businessId = `biz-${crypto.randomUUID()}`
        const ownerId = `user-${crypto.randomUUID()}`
        const salt = newSalt()

        db.businesses.push({
          id: businessId,
          name: businessName,
          businessCode,
          status: 'active',
          ownerId,
          plan: 'standard',
          subscriptionStatus: 'active',
          accessEndsAt: accessEndFromCode(activation!.accessDays, now()),
          currencyCode: 'NGN',
          timezone: isValidTimeZone(input.timezone) ? input.timezone : 'UTC',
          phone,
          address: null,
          createdAt: stamp,
          suspendedAt: null,
          suspendedReason: null,
        })
        db.users.push({
          id: ownerId,
          role: 'owner',
          businessId,
          email,
          username: null,
          displayName: ownerName,
          active: true,
          passwordSalt: salt,
          passwordHash: await hashPassword(input.password, salt),
          createdAt: stamp,
          createdBy: null,
          lastLoginAt: null,
        })
        Object.assign(activation!, { status: 'used', usedAt: stamp, usedByBusinessId: businessId })

        // One write: everything is created together, or nothing is.
        store.write(db)
        return { businessCode }
      },
    },

    staff: {
      async list() {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        return db.users
          .filter((user) => user.businessId === business.id && user.role === 'staff')
          .map(toStaffMember)
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
      },

      async create(input) {
        const db = await begin()
        const { user: owner, business } = requireMember(db, ['owner'])
        const username = normalizeUsername(input.username)
        const displayName = cleanText(input.displayName)

        if (!isValidUsername(username)) fail('username_invalid')
        if (!displayName || displayName.length > LIMITS.displayNameMax) fail('validation')
        if (input.password.length < PASSWORD_MIN || input.password.length > PASSWORD_MAX) {
          fail('weak_password')
        }
        if (
          db.users.some((user) => user.businessId === business.id && user.username === username)
        ) {
          fail('username_taken')
        }

        const salt = newSalt()
        const staff: MockUser = {
          id: `user-${crypto.randomUUID()}`,
          role: 'staff',
          businessId: business.id,
          email: null,
          username,
          displayName,
          active: true,
          passwordSalt: salt,
          passwordHash: await hashPassword(input.password, salt),
          createdAt: now().toISOString(),
          createdBy: owner.id,
          lastLoginAt: null,
        }
        db.users.push(staff)
        store.write(db)
        return toStaffMember(staff)
      },
    },

    admin: {
      async listBusinesses() {
        const db = await begin()
        requireDeveloper(db)
        return db.businesses
          .map((business) => toAdminBusiness(db, business))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      },

      async getBusiness(businessId) {
        const db = await begin()
        requireDeveloper(db)
        const business = businessOf(db, businessId)
        if (!business) fail('not_found')
        const detail: AdminBusinessDetail = {
          ...toAdminBusiness(db, business),
          activeStaffCount: db.users.filter(
            (user) => user.businessId === business.id && user.role === 'staff' && user.active,
          ).length,
          // Orders arrive in step 1B.
          orderCount: 0,
          orderCountToday: 0,
          phone: business.phone,
          timezone: business.timezone,
          currencyCode: business.currencyCode,
        }
        return detail
      },

      async platformCounts() {
        const db = await begin()
        requireDeveloper(db)
        const filters = db.businesses.map((business) =>
          accessFilterFor(accessFacts(business), now()),
        )
        return {
          businesses: db.businesses.length,
          suspended: db.businesses.filter((business) => business.status === 'suspended').length,
          endingSoon: filters.filter((filter) => filter === 'ending_soon').length,
          accessEnded: filters.filter((filter) => filter === 'ended').length,
          staff: db.users.filter((user) => user.role === 'staff').length,
          unusedCodes: db.activationCodes.filter((code) => codeStatus(code, now()) === 'unused')
            .length,
        }
      },

      async setBusinessStatus({ businessId, status, reason }) {
        const db = await begin()
        requireDeveloper(db)
        const business = businessOf(db, businessId)
        if (!business) fail('not_found')
        const cleanReason = cleanText(reason)
        if (
          (status !== 'active' && status !== 'suspended') ||
          (status === 'suspended' && !cleanReason) ||
          (cleanReason?.length ?? 0) > LIMITS.reasonMax
        ) {
          fail('validation')
        }
        business.status = status
        business.suspendedAt = status === 'suspended' ? now().toISOString() : null
        business.suspendedReason = status === 'suspended' ? cleanReason : null
        store.write(db)
      },

      async extendAccess({ businessId, days }) {
        const db = await begin()
        requireDeveloper(db)
        const business = businessOf(db, businessId)
        if (!business) fail('not_found')
        if (days !== null && !isValidAccessDays(days)) fail('validation')
        business.accessEndsAt = extendAccessEnd(business.accessEndsAt, days, now())
        store.write(db)
        return { accessEndsAt: business.accessEndsAt }
      },

      async createOwnerResetLink(businessId) {
        const db = await begin()
        requireDeveloper(db)
        const business = businessOf(db, businessId)
        const owner = business && db.users.find((user) => user.id === business.ownerId)
        if (!business || !owner?.email) fail('not_found')
        const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('')
        return {
          // A clearly fake address: in demo mode nothing is reset.
          url: `https://reset.demo.invalid/${token}`,
          expiresAt: new Date(now().getTime() + HOUR).toISOString(),
          ownerEmail: owner.email,
          simulated: true,
        }
      },

      async listActivationCodes() {
        const db = await begin()
        requireDeveloper(db)
        return db.activationCodes
          .map((code) => ({
            id: code.id,
            ownerEmail: code.ownerEmail,
            note: code.note,
            status: codeStatus(code, now()),
            createdAt: code.createdAt,
            redeemBy: code.redeemBy,
            accessDays: code.accessDays,
            usedAt: code.usedAt,
            usedByBusinessName: businessOf(db, code.usedByBusinessId)?.name ?? null,
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      },

      async generateActivationCode(input) {
        const db = await begin()
        const developer = requireDeveloper(db)
        const ownerEmail = input.ownerEmail.trim().toLowerCase()
        const note = cleanText(input.note)
        if (
          !EMAIL_PATTERN.test(ownerEmail) ||
          ownerEmail.length > LIMITS.emailMax ||
          (note?.length ?? 0) > LIMITS.noteMax ||
          !isValidRedeemDays(input.redeemDays) ||
          (input.accessDays !== null && !isValidAccessDays(input.accessDays))
        ) {
          fail('validation')
        }

        let code = newActivationCode()
        let codeHash = await hashActivationCode(code)
        while (db.activationCodes.some((existing) => existing.codeHash === codeHash)) {
          code = newActivationCode()
          codeHash = await hashActivationCode(code)
        }

        const stamp = now()
        const record = {
          id: `code-${crypto.randomUUID()}`,
          codeHash,
          ownerEmail,
          note,
          status: 'unused' as const,
          createdAt: stamp.toISOString(),
          redeemBy: redeemByFromDays(input.redeemDays, stamp),
          accessDays: input.accessDays,
          usedAt: null,
          usedByBusinessId: null,
          revokedAt: null,
          createdBy: developer.id,
        }
        db.activationCodes.push(record)
        store.write(db)
        // The only time the code itself leaves: only its hash is kept.
        return {
          id: record.id,
          code,
          ownerEmail,
          redeemBy: record.redeemBy,
          accessDays: record.accessDays,
        }
      },

      async revokeActivationCode(codeId) {
        const db = await begin()
        requireDeveloper(db)
        const code = db.activationCodes.find((candidate) => candidate.id === codeId)
        if (!code) fail('not_found')
        if (codeStatus(code, now()) !== 'unused') fail('conflict')
        code.status = 'revoked'
        code.revokedAt = now().toISOString()
        store.write(db)
      },
    },

    demo: {
      accounts: DEMO_ACCOUNTS,
      async reset() {
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
        setSignedIn(null)
        await store.reset()
      },
    },
  }

  return api
}
