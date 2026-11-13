import { DAY_MS } from '@/domain/access'
import { hashActivationCode } from '@/domain/activationCodes'
import type { DemoAccount } from '../types'
import { hashPassword } from './passwords'
import { createSalesSeed } from './seedSales'
import {
  MOCK_DB_VERSION,
  type MockActivationCode,
  type MockBusiness,
  type MockDb,
  type MockUser,
} from './store'

/**
 * The demo's starting data. Every name, email and number here is made up.
 * Dates are relative to "now", so the demo always looks current.
 *
 * Sunrise Pharmacy has the full catalogue and a week of trading (seedSales.ts).
 */

/** One password for every demo account. Shown on the login pages in demo mode. */
export const DEMO_PASSWORD = 'demo1234'

export const DEMO_IDS = {
  developer: 'user-dev',
  sunrise: 'biz-sunrise',
  sunriseOwner: 'user-sunrise-owner',
  ada: 'user-sunrise-ada',
  bola: 'user-sunrise-bola',
  chidi: 'user-sunrise-chidi',
  corner: 'biz-corner',
  cornerOwner: 'user-corner-owner',
  greenLeaf: 'biz-green-leaf',
  greenLeafOwner: 'user-green-leaf-owner',
  dailyNeeds: 'biz-daily-needs',
  dailyNeedsOwner: 'user-daily-needs-owner',
} as const

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    label: 'Developer (super-admin)',
    portal: 'owner',
    email: 'dev@demo.tallybox.test',
    password: DEMO_PASSWORD,
  },
  {
    label: 'Owner, Sunrise Pharmacy',
    portal: 'owner',
    email: 'owner@demo.tallybox.test',
    password: DEMO_PASSWORD,
    hint: 'access ends in 5 days',
  },
  {
    label: 'Staff, Sunrise Pharmacy',
    portal: 'staff',
    businessCode: 'sunrise-demo',
    username: 'ada',
    password: DEMO_PASSWORD,
  },
  {
    label: 'Staff, Sunrise Pharmacy',
    portal: 'staff',
    businessCode: 'sunrise-demo',
    username: 'chidi',
    password: DEMO_PASSWORD,
    hint: 'turned off by the owner',
  },
  {
    label: 'Owner, Green Leaf Restaurant',
    portal: 'owner',
    email: 'greenleaf@demo.tallybox.test',
    password: DEMO_PASSWORD,
    hint: 'suspended',
  },
  {
    label: 'Owner, Daily Needs Supermarket',
    portal: 'owner',
    email: 'dailyneeds@demo.tallybox.test',
    password: DEMO_PASSWORD,
    hint: 'access ended',
  },
]

export async function createSeed(now: Date = new Date()): Promise<MockDb> {
  const at = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString()

  // One salt for the whole seed keeps seeding fast. Accounts created in the
  // demo each get their own salt.
  const salt = 'demo-seed-salt'
  const passwordHash = await hashPassword(DEMO_PASSWORD, salt)

  const business = (
    fields: Partial<MockBusiness> & Pick<MockBusiness, 'id' | 'name' | 'businessCode' | 'ownerId'>,
  ): MockBusiness => ({
    status: 'active',
    plan: 'standard',
    subscriptionStatus: 'active',
    accessEndsAt: null,
    currencyCode: 'NGN',
    timezone: 'Africa/Lagos',
    phone: null,
    address: null,
    createdAt: at(-60),
    suspendedAt: null,
    suspendedReason: null,
    orderCounter: 0,
    receiptFooter: null,
    defaultLowStockLevel: 5,
    logoUrl: null,
    ...fields,
  })

  const user = (
    fields: Partial<MockUser> & Pick<MockUser, 'id' | 'role' | 'displayName'>,
  ): MockUser => ({
    businessId: null,
    email: null,
    username: null,
    active: true,
    passwordSalt: salt,
    passwordHash,
    createdAt: at(-60),
    createdBy: null,
    lastLoginAt: null,
    ...fields,
  })

  const businesses: MockBusiness[] = [
    business({
      id: DEMO_IDS.sunrise,
      name: 'Sunrise Pharmacy',
      businessCode: 'sunrise-demo',
      ownerId: DEMO_IDS.sunriseOwner,
      accessEndsAt: at(5),
      phone: '0801 000 0001',
      address: '12 Example Street, Lagos',
      receiptFooter: 'Thank you for shopping with us. Goods sold in good condition.',
      createdAt: at(-85),
    }),
    business({
      id: DEMO_IDS.corner,
      name: 'Corner Mart',
      businessCode: 'corner-mart',
      ownerId: DEMO_IDS.cornerOwner,
      accessEndsAt: null,
      createdAt: at(-200),
    }),
    business({
      id: DEMO_IDS.greenLeaf,
      name: 'Green Leaf Restaurant',
      businessCode: 'green-leaf',
      ownerId: DEMO_IDS.greenLeafOwner,
      status: 'suspended',
      accessEndsAt: at(40),
      suspendedAt: at(-2),
      suspendedReason: 'Asked to pause while the shop is renovated (demo).',
      createdAt: at(-120),
    }),
    business({
      id: DEMO_IDS.dailyNeeds,
      name: 'Daily Needs Supermarket',
      businessCode: 'daily-needs',
      ownerId: DEMO_IDS.dailyNeedsOwner,
      accessEndsAt: at(-10),
      createdAt: at(-100),
    }),
  ]

  const users: MockUser[] = [
    user({
      id: DEMO_IDS.developer,
      role: 'super_admin',
      displayName: 'Developer',
      email: 'dev@demo.tallybox.test',
    }),
    user({
      id: DEMO_IDS.sunriseOwner,
      role: 'owner',
      businessId: DEMO_IDS.sunrise,
      email: 'owner@demo.tallybox.test',
      displayName: 'Amaka Okoro',
      lastLoginAt: at(-0.2),
    }),
    user({
      id: DEMO_IDS.ada,
      role: 'staff',
      businessId: DEMO_IDS.sunrise,
      username: 'ada',
      displayName: 'Ada Eze',
      createdBy: DEMO_IDS.sunriseOwner,
      lastLoginAt: at(-0.1),
    }),
    user({
      id: DEMO_IDS.bola,
      role: 'staff',
      businessId: DEMO_IDS.sunrise,
      username: 'bola',
      displayName: 'Bola Ade',
      createdBy: DEMO_IDS.sunriseOwner,
      lastLoginAt: at(-1),
    }),
    user({
      id: DEMO_IDS.chidi,
      role: 'staff',
      businessId: DEMO_IDS.sunrise,
      username: 'chidi',
      displayName: 'Chidi Obi',
      active: false,
      createdBy: DEMO_IDS.sunriseOwner,
      lastLoginAt: at(-20),
    }),
    user({
      id: DEMO_IDS.cornerOwner,
      role: 'owner',
      businessId: DEMO_IDS.corner,
      email: 'corner@demo.tallybox.test',
      displayName: 'Tunde Bello',
      lastLoginAt: at(-0.5),
    }),
    user({
      id: DEMO_IDS.greenLeafOwner,
      role: 'owner',
      businessId: DEMO_IDS.greenLeaf,
      email: 'greenleaf@demo.tallybox.test',
      displayName: 'Ngozi Udo',
      lastLoginAt: at(-3),
    }),
    user({
      id: DEMO_IDS.dailyNeedsOwner,
      role: 'owner',
      businessId: DEMO_IDS.dailyNeeds,
      email: 'dailyneeds@demo.tallybox.test',
      displayName: 'Emeka Nwosu',
      lastLoginAt: at(-14),
    }),
  ]

  // Codes in every state. Their real text is not kept (only a hash), as in
  // production, so none of these can be redeemed: generate a fresh one to try.
  const code = async (
    fields: Omit<MockActivationCode, 'codeHash' | 'createdBy'> & { seedText: string },
  ) => {
    const { seedText, ...rest } = fields
    return { ...rest, codeHash: await hashActivationCode(seedText), createdBy: DEMO_IDS.developer }
  }

  const activationCodes: MockActivationCode[] = await Promise.all([
    code({
      id: 'code-unused',
      seedText: 'TB-SEED-UNUS',
      ownerEmail: 'new.client@example.test',
      note: 'Fresh Foods (demo)',
      status: 'unused',
      createdAt: at(-1),
      redeemBy: at(6),
      accessDays: 90,
      usedAt: null,
      usedByBusinessId: null,
      revokedAt: null,
    }),
    code({
      id: 'code-used',
      seedText: 'TB-SEED-USED',
      ownerEmail: 'corner@demo.tallybox.test',
      note: 'Corner Mart',
      status: 'used',
      createdAt: at(-201),
      redeemBy: at(-194),
      accessDays: null,
      usedAt: at(-200),
      usedByBusinessId: DEMO_IDS.corner,
      revokedAt: null,
    }),
    code({
      id: 'code-revoked',
      seedText: 'TB-SEED-REVK',
      ownerEmail: 'typo@example.test',
      note: 'Sent to the wrong email',
      status: 'revoked',
      createdAt: at(-9),
      redeemBy: at(-2),
      accessDays: 30,
      usedAt: null,
      usedByBusinessId: null,
      revokedAt: at(-8),
    }),
    code({
      id: 'code-expired',
      seedText: 'TB-SEED-EXPD',
      ownerEmail: 'slow.client@example.test',
      note: 'Never registered',
      status: 'unused',
      createdAt: at(-30),
      redeemBy: at(-23),
      accessDays: 30,
      usedAt: null,
      usedByBusinessId: null,
      revokedAt: null,
    }),
  ])

  const sunrise = businesses.find((candidate) => candidate.id === DEMO_IDS.sunrise)!
  const sales = createSalesSeed({
    now,
    businessId: sunrise.id,
    timezone: sunrise.timezone,
    ownerId: DEMO_IDS.sunriseOwner,
    ownerName: 'Amaka Okoro',
    staff: [
      { id: DEMO_IDS.ada, name: 'Ada Eze', weight: 3 },
      { id: DEMO_IDS.bola, name: 'Bola Ade', weight: 2 },
      { id: DEMO_IDS.sunriseOwner, name: 'Amaka Okoro', weight: 1 },
    ],
    heldBy: { id: DEMO_IDS.ada, name: 'Ada Eze' },
  })
  sunrise.orderCounter = sales.orderCounter

  return {
    version: MOCK_DB_VERSION,
    businesses,
    users,
    activationCodes,
    items: sales.items,
    itemCosts: sales.itemCosts,
    stockMovements: sales.stockMovements,
    orders: sales.orders,
    heldOrders: sales.heldOrders,
    restocks: sales.restocks,
    rateLimits: {},
  }
}
