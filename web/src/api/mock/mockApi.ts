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
import {
  checkOrder,
  isPaymentMethod,
  normalizeCart,
  ORDER_LIMITS,
  type CartLine,
} from '@/domain/orders'
import { dateKey, isValidTimeZone } from '@/lib/dates'
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
  HeldOrder,
  Item,
  Order,
} from '../types'
import { hashPassword, newSalt, passwordMatches } from './passwords'
import { createSeed, DEMO_ACCOUNTS } from './seed'
import {
  browserStorage,
  MockStore,
  type KeyValueStorage,
  type MockBusiness,
  type MockDb,
  type MockHeldOrder,
  type MockItem,
  type MockOrder,
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

  const todayKey = (business: MockBusiness) => dateKey(now(), business.timezone)

  function toItem(item: MockItem): Item {
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      price: item.price,
      quantity: item.quantity,
      lowStockLevel: item.lowStockLevel,
      active: item.active,
    }
  }

  function toOrder(order: MockOrder): Order {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      staffId: order.staffId,
      staffName: order.staffName,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentReference: order.paymentReference,
      paymentConfirmedByName: order.paymentConfirmedByName,
      paymentConfirmedAt: order.paymentConfirmedAt,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      note: order.note,
      dateKey: order.dateKey,
      createdAt: order.createdAt,
      voidedAt: order.voidedAt,
      voidedByName: order.voidedByName,
      voidReason: order.voidReason,
      lines: order.lines.map((line) => ({ ...line })),
    }
  }

  function toHeldOrder(db: MockDb, held: MockHeldOrder): HeldOrder {
    const lines = held.lines.map((line) => {
      const item = db.items.find((candidate) => candidate.id === line.itemId)
      return {
        itemId: line.itemId,
        quantity: line.quantity,
        name: item?.name ?? 'Removed item',
        unitPrice: item?.price ?? 0,
        available: item?.quantity ?? 0,
        active: item?.active ?? false,
      }
    })
    return {
      id: held.id,
      staffId: held.staffId,
      staffName: held.staffName,
      customerName: held.customerName,
      customerPhone: held.customerPhone,
      note: held.note,
      createdAt: held.createdAt,
      updatedAt: held.updatedAt,
      lines,
      total: lines.reduce(
        (sum, line) => sum + (line.active ? line.unitPrice * line.quantity : 0),
        0,
      ),
    }
  }

  /** Optional text fields: trimmed, blank becomes null, too long is refused. */
  function optional(value: string | null | undefined, max: number): string | null {
    const cleaned = cleanText(value)
    if ((cleaned?.length ?? 0) > max) fail('validation')
    return cleaned
  }

  /** A cart from the browser: merged, whole numbers, at least one line. */
  function cartFrom(lines: readonly CartLine[]): CartLine[] {
    const normalized = normalizeCart(lines)
    if (!normalized || normalized.length === 0) fail('validation')
    return normalized
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

      async changePassword({ currentPassword, newPassword }) {
        const db = await begin()
        const user = db.users.find((candidate) => candidate.id === signedInUserId())
        if (!user) fail('unauthenticated')
        if (user.role !== 'super_admin') requireMember(db, ['owner', 'staff'])
        if (!(await passwordMatches(currentPassword, user.passwordSalt, user.passwordHash))) {
          fail('wrong_password')
        }
        if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
          fail('weak_password')
        }
        const salt = newSalt()
        user.passwordSalt = salt
        user.passwordHash = await hashPassword(newPassword, salt)
        store.write(db)
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
          orderCounter: 0,
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

    items: {
      async list() {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner', 'staff'])
        return db.items
          .filter(
            (item) => item.businessId === business.id && (item.active || user.role === 'owner'),
          )
          .map(toItem)
          .sort((a, b) => a.name.localeCompare(b.name))
      },
    },

    orders: {
      async create(input) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner', 'staff'])
        if (!input.clientOrderId) fail('validation')

        // Already confirmed: a retry or a double tap. Return the same order.
        const existing = db.orders.find(
          (order) =>
            order.businessId === business.id && order.clientOrderId === input.clientOrderId,
        )
        if (existing) return toOrder(existing)

        if (input.paymentConfirmed !== true) fail('payment_not_confirmed')
        if (!isPaymentMethod(input.paymentMethod)) fail('validation')
        const lines = cartFrom(input.lines)
        const customerName = optional(input.customerName, ORDER_LIMITS.customerNameMax)
        const customerPhone = optional(input.customerPhone, ORDER_LIMITS.customerPhoneMax)
        const paymentReference = optional(input.paymentReference, ORDER_LIMITS.paymentReferenceMax)
        const note = optional(input.note, ORDER_LIMITS.noteMax)

        // Names and prices come from the item list now, never from the cart.
        const itemsById = new Map(
          db.items.filter((item) => item.businessId === business.id).map((item) => [item.id, item]),
        )
        const check = checkOrder(lines, itemsById)
        if (!check.ok) {
          if (check.reason === 'item_unavailable') fail('item_unavailable', { names: check.names })
          fail('insufficient_stock', { problems: check.problems })
        }

        const stamp = now()
        const at = stamp.toISOString()
        const day = dateKey(stamp, business.timezone)
        business.orderCounter += 1
        const order: MockOrder = {
          id: `order-${crypto.randomUUID()}`,
          businessId: business.id,
          orderNumber: business.orderCounter,
          clientOrderId: input.clientOrderId,
          staffId: user.id,
          staffName: user.displayName,
          total: check.total,
          paymentMethod: input.paymentMethod,
          paymentReference,
          paymentConfirmedBy: user.id,
          paymentConfirmedByName: user.displayName,
          paymentConfirmedAt: at,
          customerName,
          customerPhone,
          note,
          status: 'completed',
          dateKey: day,
          createdAt: at,
          voidedAt: null,
          voidedBy: null,
          voidedByName: null,
          voidReason: null,
          lines: check.lines,
        }

        // Stock goes down, and each line is written to the ledger.
        for (const line of check.lines) {
          const item = itemsById.get(line.itemId)!
          const before = item.quantity
          item.quantity = before - line.quantity
          item.updatedAt = at
          db.stockMovements.push({
            id: `move-${crypto.randomUUID()}`,
            businessId: business.id,
            itemId: item.id,
            itemName: item.name,
            type: 'sale',
            delta: -line.quantity,
            quantityBefore: before,
            quantityAfter: item.quantity,
            reason: null,
            note: null,
            orderId: order.id,
            restockId: null,
            supplier: null,
            unitCost: null,
            createdBy: user.id,
            createdByName: user.displayName,
            dateKey: day,
            createdAt: at,
          })
        }

        // A confirmed hold is removed in the same step.
        if (input.heldOrderId) {
          db.heldOrders = db.heldOrders.filter(
            (held) =>
              !(
                held.id === input.heldOrderId &&
                held.businessId === business.id &&
                (user.role === 'owner' || held.staffId === user.id)
              ),
          )
        }

        db.orders.push(order)
        store.write(db)
        return toOrder(order)
      },

      async listMine() {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner', 'staff'])
        const today = todayKey(business)
        return db.orders
          .filter(
            (order) =>
              order.businessId === business.id &&
              order.staffId === user.id &&
              order.dateKey === today,
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(toOrder)
      },

      async get(orderId) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner', 'staff'])
        const order = db.orders.find(
          (candidate) => candidate.id === orderId && candidate.businessId === business.id,
        )
        // Staff may open only their own orders from today.
        if (
          !order ||
          (user.role === 'staff' &&
            (order.staffId !== user.id || order.dateKey !== todayKey(business)))
        ) {
          fail('not_found')
        }
        return toOrder(order)
      },
    },

    held: {
      async list() {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner', 'staff'])
        return db.heldOrders
          .filter(
            (held) =>
              held.businessId === business.id &&
              (user.role === 'owner' || held.staffId === user.id),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((held) => toHeldOrder(db, held))
      },

      async save(input) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner', 'staff'])
        const lines = cartFrom(input.lines)
        const customerName = optional(input.customerName, ORDER_LIMITS.customerNameMax)
        const customerPhone = optional(input.customerPhone, ORDER_LIMITS.customerPhoneMax)
        const note = optional(input.note, ORDER_LIMITS.noteMax)

        const names = lines.flatMap((line) => {
          const item = db.items.find(
            (candidate) => candidate.id === line.itemId && candidate.businessId === business.id,
          )
          return item?.active ? [] : [item?.name ?? 'An item']
        })
        if (names.length > 0) fail('item_unavailable', { names })

        const at = now().toISOString()
        let held: MockHeldOrder | undefined
        if (input.heldOrderId) {
          held = db.heldOrders.find(
            (candidate) =>
              candidate.id === input.heldOrderId &&
              candidate.businessId === business.id &&
              (user.role === 'owner' || candidate.staffId === user.id),
          )
        }
        if (held) {
          Object.assign(held, { lines, customerName, customerPhone, note, updatedAt: at })
        } else {
          held = {
            id: `held-${crypto.randomUUID()}`,
            businessId: business.id,
            staffId: user.id,
            staffName: user.displayName,
            customerName,
            customerPhone,
            note,
            createdAt: at,
            updatedAt: at,
            lines,
          }
          db.heldOrders.push(held)
        }
        store.write(db)
        return toHeldOrder(db, held)
      },

      async discard(heldOrderId) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner', 'staff'])
        const held = db.heldOrders.find(
          (candidate) =>
            candidate.id === heldOrderId &&
            candidate.businessId === business.id &&
            (user.role === 'owner' || candidate.staffId === user.id),
        )
        if (!held) fail('not_found')
        db.heldOrders = db.heldOrders.filter((candidate) => candidate.id !== held.id)
        store.write(db)
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
          orderCount: db.orders.filter((order) => order.businessId === business.id).length,
          orderCountToday: db.orders.filter(
            (order) => order.businessId === business.id && order.dateKey === todayKey(business),
          ).length,
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
