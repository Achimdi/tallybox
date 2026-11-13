import type { BusinessStatus } from '@/domain/access'
import type { StoredCodeStatus } from '@/domain/activationCodes'
import type { PaymentMethod } from '@/domain/orders'
import type { RateCounters } from '@/domain/rateLimit'

/**
 * The mock's "database": one JSON document kept in this browser.
 *
 * Every operation reads the latest copy, changes it and writes it back, so two
 * tabs of the same browser share one demo (the developer can suspend a business
 * in one tab and see the owner's tab react on focus).
 */

export const STORAGE_KEY = 'tb.demo.v1'
// Bump when the shape changes: older demo data in a browser is then replaced by the new seed.
const VERSION = 2

export interface MockBusiness {
  id: string
  name: string
  businessCode: string
  status: BusinessStatus
  ownerId: string | null
  plan: 'standard'
  subscriptionStatus: 'active'
  /** End of the granted access period. Null means open-ended. */
  accessEndsAt: string | null
  currencyCode: string
  timezone: string
  phone: string | null
  address: string | null
  createdAt: string
  suspendedAt: string | null
  suspendedReason: string | null
  /** The last order number used. Each new order takes the next one. */
  orderCounter: number
}

export interface MockUser {
  id: string
  role: 'super_admin' | 'owner' | 'staff'
  businessId: string | null
  /** Owners and the developer. Lowercase. */
  email: string | null
  /** Staff. Lowercase, unique within the business. */
  username: string | null
  displayName: string
  active: boolean
  /** Salted SHA-256: the password itself is never stored, even in the demo. */
  passwordSalt: string
  passwordHash: string
  createdAt: string
  createdBy: string | null
  lastLoginAt: string | null
}

export interface MockActivationCode {
  id: string
  codeHash: string
  ownerEmail: string
  note: string | null
  status: StoredCodeStatus
  createdAt: string
  redeemBy: string
  accessDays: number | null
  usedAt: string | null
  usedByBusinessId: string | null
  revokedAt: string | null
  createdBy: string | null
}

export interface MockItem {
  id: string
  businessId: string
  name: string
  category: string | null
  unit: string | null
  price: number
  quantity: number
  lowStockLevel: number
  active: boolean
  createdAt: string
  updatedAt: string
}

/** Kept apart from items: only owners may ever read cost prices. */
export interface MockItemCost {
  itemId: string
  businessId: string
  costPrice: number
}

export type MovementType = 'opening' | 'sale' | 'void' | 'restock' | 'adjustment'

/** The stock ledger. Append-only: rows are never changed or removed. */
export interface MockStockMovement {
  id: string
  businessId: string
  itemId: string
  itemName: string
  type: MovementType
  delta: number
  quantityBefore: number
  quantityAfter: number
  reason: string | null
  note: string | null
  orderId: string | null
  restockId: string | null
  supplier: string | null
  unitCost: number | null
  createdBy: string | null
  createdByName: string
  dateKey: string
  createdAt: string
}

export interface MockOrderLine {
  itemId: string
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

export interface MockOrder {
  id: string
  businessId: string
  orderNumber: number
  clientOrderId: string
  staffId: string
  staffName: string
  total: number
  paymentMethod: PaymentMethod
  paymentReference: string | null
  paymentConfirmedBy: string
  paymentConfirmedByName: string
  paymentConfirmedAt: string
  customerName: string | null
  customerPhone: string | null
  note: string | null
  status: 'completed' | 'voided'
  dateKey: string
  createdAt: string
  voidedAt: string | null
  voidedBy: string | null
  voidedByName: string | null
  voidReason: string | null
  lines: MockOrderLine[]
}

/** A hold stores only items and quantities: prices and stock are checked on confirming. */
export interface MockHeldOrder {
  id: string
  businessId: string
  staffId: string
  staffName: string
  customerName: string | null
  customerPhone: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  lines: { itemId: string; quantity: number }[]
}

export interface MockDb {
  version: typeof VERSION
  businesses: MockBusiness[]
  users: MockUser[]
  activationCodes: MockActivationCode[]
  items: MockItem[]
  itemCosts: MockItemCost[]
  stockMovements: MockStockMovement[]
  orders: MockOrder[]
  heldOrders: MockHeldOrder[]
  rateLimits: RateCounters
}

export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** Plain memory, for tests (and when the browser blocks storage). */
export function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>()
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  }
}

/** The browser's localStorage, falling back to memory if it is blocked. */
export function browserStorage(): KeyValueStorage {
  const fallback = memoryStorage()
  const local = (): Storage | null => {
    try {
      return window.localStorage
    } catch {
      return null
    }
  }
  return {
    get: (key) => {
      try {
        return local()?.getItem(key) ?? fallback.get(key)
      } catch {
        return fallback.get(key)
      }
    },
    set: (key, value) => {
      try {
        const storage = local()
        if (storage) storage.setItem(key, value)
        else fallback.set(key, value)
      } catch {
        fallback.set(key, value)
      }
    },
    remove: (key) => {
      try {
        local()?.removeItem(key)
      } catch {
        // Nothing to do.
      }
      fallback.remove(key)
    },
  }
}

export class MockStore {
  private readonly storage: KeyValueStorage
  private readonly createSeed: () => Promise<MockDb>

  constructor(storage: KeyValueStorage, createSeed: () => Promise<MockDb>) {
    this.storage = storage
    this.createSeed = createSeed
  }

  /** The current data, seeding it the first time (or if what is stored is unreadable). */
  async read(): Promise<MockDb> {
    const raw = this.storage.get(STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as MockDb
        if (parsed.version === VERSION) return parsed
      } catch {
        // Unreadable: start again from the seed below.
      }
    }
    const seed = await this.createSeed()
    this.write(seed)
    return seed
  }

  write(db: MockDb): void {
    this.storage.set(STORAGE_KEY, JSON.stringify(db))
  }

  async reset(): Promise<void> {
    this.storage.remove(STORAGE_KEY)
    await this.read()
  }
}

export { VERSION as MOCK_DB_VERSION }
