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
  isLogoDataUrl,
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
  type StockFacts,
} from '@/domain/orders'
import { itemSales, lowStockItems, lowSupplies, summarizeDay } from '@/domain/reports'
import { buildSalesReport, inRange, isValidRange, type SupplySaleFact } from '@/domain/salesReport'
import { availableToSell, SUPPLY_LIMITS, validSupplyUses, type SupplyUse } from '@/domain/supplies'
import {
  isAdjustReason,
  restockLinesProblem,
  STOCK_LIMITS,
  type MovementType,
} from '@/domain/stock'
import { addDays, dateKey, isDateKey, isValidTimeZone } from '@/lib/dates'
import { deviceId as browserDeviceId } from '@/lib/device'
import { AppError, type AppErrorCode } from '@/lib/errors'
import { EXPORT_MAX_ORDERS } from '../types'
import type {
  AdminBusiness,
  AdminBusinessDetail,
  BlockedNotice,
  SessionResult,
  SessionUser,
  StaffMember,
  TallyboxApi,
  BusinessSettings,
  HeldOrder,
  Item,
  ItemSupplyUse,
  Order,
  Page,
  StockMovement,
  Supply,
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
  type MockStockMovement,
  type MockSupply,
  type MockUser,
} from './store'

type StockMode = { tracksOwnStock: boolean; supplies: SupplyUse[] }

/** True when two ways of counting stock are the same (supply order doesn't matter). */
function sameStockMode(a: StockMode, b: StockMode): boolean {
  if (a.tracksOwnStock !== b.tracksOwnStock || a.supplies.length !== b.supplies.length) return false
  const key = (mode: StockMode) =>
    mode.supplies
      .map((use) => `${use.supplyId}:${use.unitsPerSale}`)
      .sort()
      .join('|')
  return key(a) === key(b)
}

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

  /** The supplies an item uses per unit sold. */
  function usesOf(db: MockDb, itemId: string): SupplyUse[] {
    return db.itemSupplies
      .filter((use) => use.itemId === itemId)
      .map((use) => ({ supplyId: use.supplyId, unitsPerSale: use.unitsPerSale }))
  }

  function suppliesOf(db: MockDb, businessId: string): Map<string, MockSupply> {
    return new Map(
      db.supplies
        .filter((supply) => supply.businessId === businessId)
        .map((supply) => [supply.id, supply]),
    )
  }

  function sellableFacts(db: MockDb, item: MockItem): StockFacts {
    return {
      id: item.id,
      name: item.name,
      price: item.price,
      active: item.active,
      tracksOwnStock: item.tracksOwnStock,
      quantity: item.quantity,
      supplies: usesOf(db, item.id),
    }
  }

  function describeUses(db: MockDb, uses: readonly SupplyUse[]): ItemSupplyUse[] {
    return uses.map((use) => {
      const supply = db.supplies.find((candidate) => candidate.id === use.supplyId)
      return {
        supplyId: use.supplyId,
        name: supply?.name ?? 'Removed supply',
        unit: supply?.unit ?? null,
        unitsPerSale: use.unitsPerSale,
      }
    })
  }

  /** An item as the app sees it, with what can be sold now worked out from its stock and supplies. */
  function toItem(db: MockDb) {
    return (item: MockItem): Item => {
      const uses = usesOf(db, item.id)
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        price: item.price,
        tracksOwnStock: item.tracksOwnStock,
        quantity: item.quantity,
        supplies: describeUses(db, uses),
        available: availableToSell(sellableFacts(db, item), suppliesOf(db, item.businessId)),
        lowStockLevel: item.lowStockLevel,
        active: item.active,
      }
    }
  }

  function toSupply(db: MockDb) {
    return (supply: MockSupply): Supply => ({
      id: supply.id,
      name: supply.name,
      unit: supply.unit,
      quantity: supply.quantity,
      lowStockLevel: supply.lowStockLevel,
      active: supply.active,
      usedBy: db.itemSupplies
        .filter((use) => use.supplyId === supply.id)
        .map((use) => ({ use, item: db.items.find((candidate) => candidate.id === use.itemId) }))
        .filter(({ item }) => item?.active)
        .map(({ use, item }) => ({
          itemId: use.itemId,
          name: item!.name,
          unitsPerSale: use.unitsPerSale,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
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
        available: item
          ? availableToSell(sellableFacts(db, item), suppliesOf(db, item.businessId))
          : 0,
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

  /** What a stock change applies to: an item's own stock or a shared supply. */
  type StockTarget = { kind: 'item'; record: MockItem } | { kind: 'supply'; record: MockSupply }

  /**
   * The one way stock changes: the quantity and a ledger entry, together.
   * The caller writes the data once everything has succeeded.
   */
  function moveStock(
    db: MockDb,
    business: MockBusiness,
    user: MockUser,
    target: StockTarget,
    type: MovementType,
    delta: number,
    extra: Partial<MockStockMovement> = {},
  ): void {
    const at = now()
    const record = target.record
    const before = record.quantity
    record.quantity = before + delta
    record.updatedAt = at.toISOString()
    db.stockMovements.push({
      id: `move-${crypto.randomUUID()}`,
      businessId: business.id,
      itemId: target.kind === 'item' ? record.id : null,
      supplyId: target.kind === 'supply' ? record.id : null,
      itemName: record.name,
      sourceItemId: null,
      sourceItemName: null,
      type,
      delta,
      quantityBefore: before,
      quantityAfter: record.quantity,
      reason: null,
      note: null,
      orderId: null,
      restockId: null,
      supplier: null,
      unitCost: null,
      createdBy: user.id,
      createdByName: user.displayName,
      dateKey: dateKey(at, business.timezone),
      createdAt: at.toISOString(),
      ...extra,
    })
  }

  /** Finds the item or supply a restock or adjustment names, in this business. */
  function stockTarget(
    db: MockDb,
    business: MockBusiness,
    line: { itemId?: string | undefined; supplyId?: string | undefined },
    // Restocks need the item or supply to be in use; a count may be made of archived stock too.
    { allowArchived = false }: { allowArchived?: boolean } = {},
  ): StockTarget {
    if (Boolean(line.itemId) === Boolean(line.supplyId)) fail('validation')
    if (line.itemId) {
      const item = db.items.find(
        (candidate) => candidate.id === line.itemId && candidate.businessId === business.id,
      )
      if (!item) fail('not_found')
      if (!item.active && !allowArchived) fail('item_archived')
      if (!item.tracksOwnStock) fail('stock_not_counted')
      return { kind: 'item', record: item }
    }
    const supply = db.supplies.find(
      (candidate) => candidate.id === line.supplyId && candidate.businessId === business.id,
    )
    if (!supply) fail('not_found')
    if (!supply.active && !allowArchived) fail('item_archived')
    return { kind: 'supply', record: supply }
  }

  function toMovement(db: MockDb, move: MockStockMovement): StockMovement {
    return {
      id: move.id,
      itemId: move.itemId,
      supplyId: move.supplyId,
      itemName: move.itemName,
      sourceItemId: move.sourceItemId,
      sourceItemName: move.sourceItemName,
      type: move.type,
      delta: move.delta,
      quantityBefore: move.quantityBefore,
      quantityAfter: move.quantityAfter,
      reason: isAdjustReason(move.reason) ? move.reason : null,
      note: move.note,
      orderId: move.orderId,
      orderNumber: move.orderId
        ? (db.orders.find((order) => order.id === move.orderId)?.orderNumber ?? null)
        : null,
      restockId: move.restockId,
      supplier: move.supplier,
      unitCost: move.unitCost,
      createdById: move.createdBy,
      createdByName: move.createdByName,
      dateKey: move.dateKey,
      createdAt: move.createdAt,
    }
  }

  function toSettings(business: MockBusiness): BusinessSettings {
    return {
      id: business.id,
      name: business.name,
      businessCode: business.businessCode,
      currencyCode: business.currencyCode,
      timezone: business.timezone,
      address: business.address,
      phone: business.phone,
      receiptFooter: business.receiptFooter,
      defaultLowStockLevel: business.defaultLowStockLevel,
      logoUrl: business.logoUrl,
      accessEndsAt: business.accessEndsAt,
    }
  }

  function page<Row>(rows: Row[], offset = 0, limit = 25): Page<Row> {
    const size = Math.min(Math.max(limit, 1), 100)
    const start = Math.max(offset, 0)
    return { rows: rows.slice(start, start + size), total: rows.length }
  }

  const isWholeIn = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

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

      // Demo reset links are pretend (https://reset.demo.invalid/...): nothing to open.
      async readPasswordResetLink() {
        await begin()
        return null
      },

      async completePasswordReset() {
        await begin()
        fail('reset_link_invalid')
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
          receiptFooter: null,
          defaultLowStockLevel: 5,
          logoUrl: null,
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
          .map(toItem(db))
          .sort((a, b) => a.name.localeCompare(b.name))
      },

      async costs() {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        return Object.fromEntries(
          db.itemCosts
            .filter((cost) => cost.businessId === business.id)
            .map((cost) => [cost.itemId, cost.costPrice]),
        )
      },

      async upsert(input) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner'])
        const name = cleanText(input.name)
        const category = optional(input.category, STOCK_LIMITS.categoryMax)
        const unit = optional(input.unit, STOCK_LIMITS.unitMax)
        const uses = Array.isArray(input.supplies) ? input.supplies : []
        if (
          !input.itemId ||
          !name ||
          name.length > STOCK_LIMITS.itemNameMax ||
          !isWholeIn(input.price, 0, STOCK_LIMITS.maxPrice) ||
          (input.costPrice !== null && !isWholeIn(input.costPrice, 0, STOCK_LIMITS.maxPrice)) ||
          (input.lowStockLevel !== null &&
            !isWholeIn(input.lowStockLevel, 0, STOCK_LIMITS.maxLowStockLevel)) ||
          !isWholeIn(input.openingQuantity, 0, STOCK_LIMITS.maxQuantity) ||
          typeof input.tracksOwnStock !== 'boolean' ||
          !validSupplyUses(uses)
        ) {
          fail('validation')
        }
        // Every supply must belong to this business and be in use (not archived).
        for (const use of uses) {
          const supply = db.supplies.find(
            (candidate) => candidate.id === use.supplyId && candidate.businessId === business.id,
          )
          if (!supply) fail('not_found')
          if (!supply.active) fail('item_archived')
        }

        const sameId = db.items.find((item) => item.id === input.itemId)
        // An id that belongs to another business is refused, never edited.
        if (sameId && sameId.businessId !== business.id) fail('conflict')
        // A new item's opening count only makes sense if it counts its own stock.
        // (When editing, the opening count is ignored anyway.)
        if (!sameId && !input.tracksOwnStock && input.openingQuantity > 0) fail('validation')
        const clash = db.items.find(
          (item) =>
            item.businessId === business.id &&
            item.id !== input.itemId &&
            item.name.toLowerCase() === name.toLowerCase(),
        )
        if (clash) fail('item_name_taken')

        const at = now().toISOString()
        let item = sameId
        if (item) {
          // A change to how stock is counted applies to new sales only, and is recorded.
          const before = { tracksOwnStock: item.tracksOwnStock, supplies: usesOf(db, item.id) }
          const after = {
            tracksOwnStock: input.tracksOwnStock,
            supplies: uses.map((use) => ({
              supplyId: use.supplyId,
              unitsPerSale: use.unitsPerSale,
            })),
          }
          if (!sameStockMode(before, after)) {
            db.stockModeChanges.push({
              id: `mode-${crypto.randomUUID()}`,
              businessId: business.id,
              itemId: item.id,
              changedBy: user.id,
              changedByName: user.displayName,
              changedAt: at,
              before,
              after,
            })
          }
          // Editing never changes quantity: that is what restocks and adjustments are for.
          Object.assign(item, {
            name,
            category,
            unit,
            price: input.price,
            tracksOwnStock: input.tracksOwnStock,
            lowStockLevel: input.lowStockLevel ?? item.lowStockLevel,
            updatedAt: at,
          })
        } else {
          item = {
            id: input.itemId,
            businessId: business.id,
            name,
            category,
            unit,
            price: input.price,
            tracksOwnStock: input.tracksOwnStock,
            quantity: 0,
            lowStockLevel: input.lowStockLevel ?? business.defaultLowStockLevel,
            active: true,
            createdAt: at,
            updatedAt: at,
          }
          db.items.push(item)
          // The opening count is added; nothing is ever deducted from supplies here.
          if (input.openingQuantity > 0) {
            moveStock(
              db,
              business,
              user,
              { kind: 'item', record: item },
              'opening',
              input.openingQuantity,
            )
          }
        }

        const itemId = item.id
        db.itemSupplies = [
          ...db.itemSupplies.filter((use) => use.itemId !== itemId),
          ...uses.map((use) => ({
            itemId,
            supplyId: use.supplyId,
            businessId: business.id,
            unitsPerSale: use.unitsPerSale,
          })),
        ]
        db.itemCosts = db.itemCosts.filter((cost) => cost.itemId !== itemId)
        if (input.costPrice !== null) {
          db.itemCosts.push({ itemId, businessId: business.id, costPrice: input.costPrice })
        }
        store.write(db)
        return toItem(db)(item)
      },

      async archive(itemId) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const item = db.items.find(
          (candidate) => candidate.id === itemId && candidate.businessId === business.id,
        )
        if (!item) fail('not_found')
        item.active = false
        item.updatedAt = now().toISOString()
        store.write(db)
      },

      async restore(itemId) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const item = db.items.find(
          (candidate) => candidate.id === itemId && candidate.businessId === business.id,
        )
        if (!item) fail('not_found')
        item.active = true
        item.updatedAt = now().toISOString()
        store.write(db)
      },

      async stockModeChanges(itemId) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        return db.stockModeChanges
          .filter((change) => change.businessId === business.id && change.itemId === itemId)
          .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
          .map((change) => ({
            id: change.id,
            changedAt: change.changedAt,
            changedByName: change.changedByName,
            before: {
              tracksOwnStock: change.before.tracksOwnStock,
              supplies: describeUses(db, change.before.supplies),
            },
            after: {
              tracksOwnStock: change.after.tracksOwnStock,
              supplies: describeUses(db, change.after.supplies),
            },
          }))
      },
    },

    supplies: {
      async list() {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner', 'staff'])
        return db.supplies
          .filter(
            (supply) =>
              supply.businessId === business.id && (supply.active || user.role === 'owner'),
          )
          .map(toSupply(db))
          .sort((a, b) => a.name.localeCompare(b.name))
      },

      async costs() {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        return Object.fromEntries(
          db.supplyCosts
            .filter((cost) => cost.businessId === business.id)
            .map((cost) => [cost.supplyId, cost.costPrice]),
        )
      },

      async upsert(input) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner'])
        const name = cleanText(input.name)
        const unit = optional(input.unit, SUPPLY_LIMITS.unitMax)
        if (
          !input.supplyId ||
          !name ||
          name.length > SUPPLY_LIMITS.nameMax ||
          (input.costPrice !== null && !isWholeIn(input.costPrice, 0, STOCK_LIMITS.maxPrice)) ||
          (input.lowStockLevel !== null &&
            !isWholeIn(input.lowStockLevel, 0, STOCK_LIMITS.maxLowStockLevel)) ||
          !isWholeIn(input.openingQuantity, 0, STOCK_LIMITS.maxQuantity)
        ) {
          fail('validation')
        }
        const sameId = db.supplies.find((supply) => supply.id === input.supplyId)
        if (sameId && sameId.businessId !== business.id) fail('conflict')
        const clash = db.supplies.find(
          (supply) =>
            supply.businessId === business.id &&
            supply.id !== input.supplyId &&
            supply.name.toLowerCase() === name.toLowerCase(),
        )
        if (clash) fail('supply_name_taken')

        const at = now().toISOString()
        let supply = sameId
        if (supply) {
          Object.assign(supply, {
            name,
            unit,
            lowStockLevel: input.lowStockLevel ?? supply.lowStockLevel,
            updatedAt: at,
          })
        } else {
          supply = {
            id: input.supplyId,
            businessId: business.id,
            name,
            unit,
            quantity: 0,
            lowStockLevel: input.lowStockLevel ?? business.defaultLowStockLevel,
            active: true,
            createdAt: at,
            updatedAt: at,
          }
          db.supplies.push(supply)
          if (input.openingQuantity > 0) {
            moveStock(
              db,
              business,
              user,
              { kind: 'supply', record: supply },
              'opening',
              input.openingQuantity,
            )
          }
        }
        const supplyId = supply.id
        db.supplyCosts = db.supplyCosts.filter((cost) => cost.supplyId !== supplyId)
        if (input.costPrice !== null) {
          db.supplyCosts.push({ supplyId, businessId: business.id, costPrice: input.costPrice })
        }
        store.write(db)
        return toSupply(db)(supply)
      },

      async archive(supplyId) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const supply = db.supplies.find(
          (candidate) => candidate.id === supplyId && candidate.businessId === business.id,
        )
        if (!supply) fail('not_found')
        // Archiving a supply that items on sale still use would quietly stop them selling.
        const inUse = db.itemSupplies.some(
          (use) =>
            use.supplyId === supplyId &&
            db.items.some((item) => item.id === use.itemId && item.active),
        )
        if (inUse) fail('supply_in_use')
        supply.active = false
        supply.updatedAt = now().toISOString()
        store.write(db)
      },

      async restore(supplyId) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const supply = db.supplies.find(
          (candidate) => candidate.id === supplyId && candidate.businessId === business.id,
        )
        if (!supply) fail('not_found')
        supply.active = true
        supply.updatedAt = now().toISOString()
        store.write(db)
      },
    },

    stock: {
      async restock(input) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner'])
        if (!input.clientId) fail('validation')

        // Already saved: a retry or a double tap. Nothing is added twice.
        const existing = db.restocks.find(
          (restock) => restock.businessId === business.id && restock.clientId === input.clientId,
        )
        if (existing) return { restockId: existing.id }

        const today = todayKey(business)
        const supplier = optional(input.supplier, STOCK_LIMITS.supplierMax)
        const note = optional(input.note, STOCK_LIMITS.noteMax)
        if (
          !isDateKey(input.receivedOn) ||
          input.receivedOn > today ||
          input.receivedOn < addDays(today, -STOCK_LIMITS.restockMaxAgeDays) ||
          input.lines.length > STOCK_LIMITS.maxRestockLines ||
          restockLinesProblem(input.lines) !== null ||
          input.lines.some(
            (line) => line.unitCost !== null && !isWholeIn(line.unitCost, 0, STOCK_LIMITS.maxPrice),
          )
        ) {
          fail('validation')
        }

        // Each line is an item that counts its own stock, or a shared supply.
        const targets = input.lines.map((line) => stockTarget(db, business, line))

        const restockId = `restock-${crypto.randomUUID()}`
        db.restocks.push({
          id: restockId,
          businessId: business.id,
          clientId: input.clientId,
          supplier,
          note,
          receivedOn: input.receivedOn,
          createdBy: user.id,
          createdByName: user.displayName,
          createdAt: now().toISOString(),
        })
        input.lines.forEach((line, index) => {
          moveStock(db, business, user, targets[index]!, 'restock', line.quantity, {
            restockId,
            supplier,
            unitCost: line.unitCost,
            note,
          })
        })
        store.write(db)
        return { restockId }
      },

      async adjust(input) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner'])
        const note = optional(input.note, STOCK_LIMITS.noteMax)
        if (
          !isAdjustReason(input.reason) ||
          !isWholeIn(input.countedQuantity, 0, STOCK_LIMITS.maxQuantity) ||
          !Number.isInteger(input.expectedQuantity) ||
          (input.reason === 'other' && !note)
        ) {
          fail('validation')
        }
        const target = stockTarget(db, business, input, { allowArchived: true })
        const current = target.record.quantity
        // The count was made against a different number: someone sold or restocked meanwhile.
        if (current !== input.expectedQuantity) fail('conflict', { quantity: current })
        if (input.countedQuantity === current) fail('validation')

        moveStock(db, business, user, target, 'adjustment', input.countedQuantity - current, {
          reason: input.reason,
          note,
        })
        store.write(db)
        return { quantity: target.record.quantity }
      },

      async movements(filter) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const rows = db.stockMovements
          .filter(
            (move) =>
              move.businessId === business.id &&
              (!filter.itemId || move.itemId === filter.itemId) &&
              (!filter.supplyId || move.supplyId === filter.supplyId) &&
              (!filter.type || move.type === filter.type) &&
              (!filter.from || move.dateKey >= filter.from) &&
              (!filter.to || move.dateKey <= filter.to) &&
              (!filter.userId || move.createdBy === filter.userId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
          .map((move) => toMovement(db, move))
        return page(rows, filter.offset, filter.limit)
      },
    },

    reports: {
      async dashboard() {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const today = todayKey(business)
        const orders = db.orders.filter((order) => order.businessId === business.id)
        return {
          today: summarizeDay(orders, today),
          yesterday: summarizeDay(orders, addDays(today, -1)),
          topItemsToday: itemSales(orders, (order) => order.dateKey === today).slice(0, 5),
          lowStock: lowStockItems(db.items.filter((item) => item.businessId === business.id)).map(
            toItem(db),
          ),
          lowSupplies: lowSupplies(
            db.supplies.filter((supply) => supply.businessId === business.id),
          ).map(toSupply(db)),
        }
      },

      async summary(range) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        if (!isValidRange(range)) fail('validation')
        const costs = Object.fromEntries(
          db.itemCosts
            .filter((cost) => cost.businessId === business.id)
            .map((cost) => [cost.itemId, cost.costPrice]),
        )
        return buildSalesReport(
          db.orders.filter((order) => order.businessId === business.id),
          range,
          db.items.filter((item) => item.businessId === business.id),
          costs,
          {
            supplies: db.supplies.filter((supply) => supply.businessId === business.id),
            costs: Object.fromEntries(
              db.supplyCosts
                .filter((cost) => cost.businessId === business.id)
                .map((cost) => [cost.supplyId, cost.costPrice]),
            ),
            sales: db.stockMovements.filter(
              (move) =>
                move.businessId === business.id && move.supplyId !== null && move.type === 'sale',
            ) as SupplySaleFact[],
          },
        )
      },

      async exportOrders(range) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        if (!isValidRange(range)) fail('validation')
        const matching = db.orders
          .filter((order) => order.businessId === business.id && inRange(order.dateKey, range))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        return {
          orders: matching.slice(0, EXPORT_MAX_ORDERS).map(toOrder),
          truncated: matching.length > EXPORT_MAX_ORDERS,
        }
      },
    },

    business: {
      async get() {
        const db = await begin()
        const { business } = requireMember(db, ['owner', 'staff'])
        return toSettings(business)
      },

      async update(input) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const name = cleanText(input.name)
        const currency = input.currencyCode.trim().toUpperCase()
        let currencyKnown = true
        try {
          new Intl.NumberFormat('en', { style: 'currency', currency })
        } catch {
          currencyKnown = false
        }
        if (
          !name ||
          name.length < LIMITS.businessNameMin ||
          name.length > LIMITS.businessNameMax ||
          !/^[A-Z]{3}$/.test(currency) ||
          !currencyKnown ||
          !isValidTimeZone(input.timezone) ||
          !isWholeIn(input.defaultLowStockLevel, 0, STOCK_LIMITS.maxLowStockLevel) ||
          (typeof input.logo === 'string' && !isLogoDataUrl(input.logo))
        ) {
          fail('validation')
        }
        Object.assign(business, {
          name,
          currencyCode: currency,
          timezone: input.timezone,
          address: optional(input.address, 200),
          phone: optional(input.phone, LIMITS.phoneMax),
          receiptFooter: optional(input.receiptFooter, 200),
          defaultLowStockLevel: input.defaultLowStockLevel,
          ...(input.logo === undefined ? {} : { logoUrl: input.logo }),
        })
        store.write(db)
        return toSettings(business)
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
        const records = new Map(
          db.items.filter((item) => item.businessId === business.id).map((item) => [item.id, item]),
        )
        const itemsById = new Map(
          [...records.values()].map((item) => [item.id, sellableFacts(db, item)]),
        )
        const supplies = suppliesOf(db, business.id)
        // Own stock and shared supplies are checked together, every line's needs added up.
        const check = checkOrder(lines, itemsById, supplies)
        if (!check.ok) {
          if (check.reason === 'item_unavailable') fail('item_unavailable', { names: check.names })
          fail('insufficient_stock', {
            problems: check.problems,
            supplyProblems: check.supplyProblems,
          })
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

        // Own stock goes down for items that count it, each line in the ledger.
        for (const line of check.lines) {
          const item = records.get(line.itemId)!
          if (!item.tracksOwnStock) continue
          moveStock(db, business, user, { kind: 'item', record: item }, 'sale', -line.quantity, {
            orderId: order.id,
          })
        }
        // Every supply deduction is its own ledger entry, linked to the order and the item.
        for (const deduction of check.supplyDeductions) {
          const supply = supplies.get(deduction.supplyId)!
          const item = records.get(deduction.itemId)!
          moveStock(
            db,
            business,
            user,
            { kind: 'supply', record: supply },
            'sale',
            -deduction.quantity,
            {
              orderId: order.id,
              sourceItemId: item.id,
              sourceItemName: item.name,
            },
          )
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

      async list(filter) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        if (!isDateKey(filter.from) || !isDateKey(filter.to) || filter.from > filter.to) {
          fail('validation')
        }
        const searchNumber = filter.search?.replace(/[#\s]/g, '')
        const wanted = searchNumber ? Number.parseInt(searchNumber, 10) : null
        const rows = db.orders
          .filter(
            (order) =>
              order.businessId === business.id &&
              order.dateKey >= filter.from &&
              order.dateKey <= filter.to &&
              (!filter.staffId || order.staffId === filter.staffId) &&
              (!filter.status || order.status === filter.status) &&
              (!filter.paymentMethod || order.paymentMethod === filter.paymentMethod) &&
              (wanted === null || Number.isNaN(wanted) || order.orderNumber === wanted),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(toOrder)
        return page(rows, filter.offset, filter.limit)
      },

      async void({ orderId, reason }) {
        const db = await begin()
        const { user, business } = requireMember(db, ['owner'])
        const order = db.orders.find(
          (candidate) => candidate.id === orderId && candidate.businessId === business.id,
        )
        if (!order) fail('not_found')
        const why = cleanText(reason)
        if (!why || why.length > STOCK_LIMITS.voidReasonMax) fail('validation')
        if (order.status !== 'completed') fail('conflict')

        // Stock goes back by reversing this order's own sale entries, items and supplies
        // alike, so a later change to what an item uses never corrupts an old order.
        const sales = db.stockMovements.filter(
          (move) => move.orderId === order.id && move.type === 'sale',
        )
        for (const sale of sales) {
          const target: StockTarget | null = sale.itemId
            ? (() => {
                const item = db.items.find((candidate) => candidate.id === sale.itemId)
                return item ? { kind: 'item' as const, record: item } : null
              })()
            : (() => {
                const supply = db.supplies.find((candidate) => candidate.id === sale.supplyId)
                return supply ? { kind: 'supply' as const, record: supply } : null
              })()
          if (!target) continue
          moveStock(db, business, user, target, 'void', -sale.delta, {
            orderId: order.id,
            sourceItemId: sale.sourceItemId,
            sourceItemName: sale.sourceItemName,
          })
        }
        Object.assign(order, {
          status: 'voided',
          voidedAt: now().toISOString(),
          voidedBy: user.id,
          voidedByName: user.displayName,
          voidReason: why,
        })
        store.write(db)
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

      async resetPassword({ staffId, newPassword }) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const staff = db.users.find(
          (user) => user.id === staffId && user.businessId === business.id && user.role === 'staff',
        )
        if (!staff) fail('not_found')
        if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX)
          fail('weak_password')
        const salt = newSalt()
        staff.passwordSalt = salt
        staff.passwordHash = await hashPassword(newPassword, salt)
        store.write(db)
      },

      async setActive({ staffId, active }) {
        const db = await begin()
        const { business } = requireMember(db, ['owner'])
        const staff = db.users.find(
          (user) => user.id === staffId && user.businessId === business.id && user.role === 'staff',
        )
        if (!staff) fail('not_found')
        staff.active = active
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
