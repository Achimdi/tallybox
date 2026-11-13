import type { BusinessStatus } from '@/domain/access'
import type { StoredCodeStatus } from '@/domain/activationCodes'
import type { RateCounters } from '@/domain/rateLimit'

/**
 * The mock's "database": one JSON document kept in this browser.
 *
 * Every operation reads the latest copy, changes it and writes it back, so two
 * tabs of the same browser share one demo (the developer can suspend a business
 * in one tab and see the owner's tab react on focus).
 */

export const STORAGE_KEY = 'tb.demo.v1'
const VERSION = 1

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

export interface MockDb {
  version: typeof VERSION
  businesses: MockBusiness[]
  users: MockUser[]
  activationCodes: MockActivationCode[]
  rateLimits: RateCounters
  /** Who is signed in in this browser. */
  sessionUserId: string | null
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
