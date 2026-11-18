/**
 * TallyboxApi: the ONE way screens get and change data.
 *
 * No component talks to a data source directly. There are two implementations:
 *   - mock:     demo data kept in this browser, enforcing the real rules
 *   - supabase: the real backend
 * `VITE_DATA_SOURCE` picks one. Both must pass the same contract tests
 * (src/api/contract), so swapping them changes nothing the screens can see.
 *
 * Rules for every method:
 *   - It acts as the person who is signed in (like a real server would).
 *   - It fails only with an AppError carrying a known code (src/lib/errors.ts).
 *   - Dates are ISO strings. Money is whole minor units.
 */

import type { AccessFilter, BusinessStatus } from '@/domain/access'
import type { CodeStatus } from '@/domain/activationCodes'
import type { CartLine, PaymentMethod } from '@/domain/orders'
import type { WatermarkKind, WatermarkSettings } from '@/domain/receiptWatermark'
import type { DaySummary, ItemSales } from '@/domain/reports'
import type { ReportRange, SalesReport } from '@/domain/salesReport'
import type { AdjustReason, MovementType, RestockLine } from '@/domain/stock'
import type { SupplyUse } from '@/domain/supplies'

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type Role = 'super_admin' | 'owner' | 'staff'

export interface SessionUser {
  id: string
  role: Role
  displayName: string
  /** Owners and the developer sign in with email. */
  email: string | null
  /** Staff sign in with a username. */
  username: string | null
  /** Everything below is null for the developer, who belongs to no business. */
  businessId: string | null
  businessName: string | null
  businessCode: string | null
  currencyCode: string | null
  timezone: string | null
  /** When the business's access period ends. Null means open-ended. */
  accessEndsAt: string | null
}

/**
 * Why someone with a correct password is not let in.
 * - suspended:    the developer suspended the business
 * - access_ended: the business's access period (plus grace) has run out
 * - disabled:     the owner turned this account off
 * - no_profile:   the account belongs to no business
 */
export type BlockedReason = 'suspended' | 'access_ended' | 'disabled' | 'no_profile'

export interface BlockedNotice {
  reason: BlockedReason
  businessName: string | null
  /** For access_ended: when access ended. */
  accessEndedAt: string | null
}

export type SessionResult =
  { kind: 'user'; user: SessionUser } | { kind: 'blocked'; notice: BlockedNotice }

export type SignInInput =
  | { portal: 'owner'; email: string; password: string; captchaToken?: string | undefined }
  | {
      portal: 'staff'
      businessCode: string
      username: string
      password: string
      captchaToken?: string | undefined
    }

export interface AuthApi {
  /**
   * Signs in. Returns the user, or a blocked notice (and stays signed out) for
   * a suspended business, ended access or a turned-off account. Throws
   * invalid_credentials, wrong_portal, rate_limited...
   */
  signIn(input: SignInInput): Promise<SessionResult>
  /** Who is signed in right now, re-checked live. Null when nobody is. */
  getSession(): Promise<SessionResult | null>
  signOut(): Promise<void>
  /** For the signed-in person. Throws wrong_password or weak_password. */
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>
  /**
   * An owner who forgot their password gets a one-time link from Tallybox
   * (the developer portal makes it), ending in ?token=... Using the token
   * signs them in for that one purpose and says who it is for. Call it only
   * when the person asks to continue: link previews open links too, and must
   * not use the token up. Throws reset_link_invalid (expired, used or wrong).
   */
  openPasswordResetLink(token: string): Promise<{ email: string }>
  /** Sets the new password after opening a link, once. Throws weak_password or reset_link_invalid. */
  completePasswordReset(input: { newPassword: string }): Promise<void>
}

// ---------------------------------------------------------------------------
// Registration (public)
// ---------------------------------------------------------------------------

export interface RegistrationInput {
  businessName: string
  businessCode: string
  ownerName: string
  email: string
  password: string
  phone: string
  activationCode: string
  /** The browser's timezone, as a first setting. */
  timezone: string
  captchaToken?: string | undefined
}

export interface RegistrationApi {
  isBusinessCodeAvailable(businessCode: string): Promise<boolean>
  /** Creates the business and its owner. Throws a field-specific code when refused. */
  registerBusiness(input: RegistrationInput): Promise<{ businessCode: string }>
}

// ---------------------------------------------------------------------------
// Items (read by staff and owners; cost prices are owner-only)
// ---------------------------------------------------------------------------

export interface Item {
  id: string
  name: string
  category: string | null
  unit: string | null
  /** Selling price in minor units. */
  price: number
  /** False when the item doesn't count its own stock (it may use shared supplies, or nothing). */
  tracksOwnStock: boolean
  /** Own stock on hand. Only meaningful when tracksOwnStock is true. */
  quantity: number
  /** Shared supplies each unit sold uses, for example 1 bottle and 1 cap. */
  supplies: ItemSupplyUse[]
  /**
   * How many can be sold now: the lowest of own stock and each supply ÷ units
   * per sale. Null when nothing limits it (the item counts nothing).
   */
  available: number | null
  lowStockLevel: number
  /** False means archived: not sold, hidden from staff. */
  active: boolean
}

export interface ItemSupplyUse {
  supplyId: string
  /** The supply's name, for showing. */
  name: string
  unit: string | null
  unitsPerSale: number
}

export interface ItemInput {
  /** Chosen by the app for a new item, so saving twice never makes two items. */
  itemId: string
  name: string
  category: string
  unit: string
  /** Selling price, minor units. */
  price: number
  /** Owner-only. Null removes it. */
  costPrice: number | null
  /** Null keeps the current level (or uses the business default for a new item). */
  lowStockLevel: number | null
  /** New items only; later changes go through restocks and adjustments. */
  openingQuantity: number
  /** Count this item's own stock. On by default. */
  tracksOwnStock: boolean
  /** Shared supplies used per unit sold. Empty means none. Changes apply to new sales only. */
  supplies: SupplyUse[]
}

/** A change to how an item counts stock, kept as a permanent record. */
export interface StockModeChange {
  id: string
  changedAt: string
  changedByName: string
  before: { tracksOwnStock: boolean; supplies: ItemSupplyUse[] }
  after: { tracksOwnStock: boolean; supplies: ItemSupplyUse[] }
}

export interface ItemsApi {
  /** Staff see items on sale. Owners also see archived items. Sorted by name. */
  list(): Promise<Item[]>
  /** Owner only: cost prices by item id. Items without one are left out. */
  costs(): Promise<Record<string, number>>
  /** Owner only. Creates or edits. Never changes quantity, except the opening count of a new item. */
  upsert(input: ItemInput): Promise<Item>
  /** Owner only. Hides an item from selling and from staff. Its history stays. */
  archive(itemId: string): Promise<void>
  restore(itemId: string): Promise<void>
  /** Owner only. Every change to how the item counts stock, newest first. */
  stockModeChanges(itemId: string): Promise<StockModeChange[]>
}

// ---------------------------------------------------------------------------
// Shared supplies: stock counted by packaging or materials (bottles, caps…)
// ---------------------------------------------------------------------------

export interface Supply {
  id: string
  name: string
  unit: string | null
  quantity: number
  lowStockLevel: number
  /** False means archived. */
  active: boolean
  /** Items on sale that use this supply. */
  usedBy: { itemId: string; name: string; unitsPerSale: number }[]
}

export interface SupplyInput {
  /** Chosen by the app for a new supply, so saving twice never makes two. */
  supplyId: string
  name: string
  unit: string
  /** Owner-only. Null removes it. */
  costPrice: number | null
  /** Null keeps the current level (or uses the business default for a new supply). */
  lowStockLevel: number | null
  /** New supplies only. */
  openingQuantity: number
}

export interface SuppliesApi {
  /** Staff see supplies on sale (to know what can be sold), never costs. Owners also see archived ones. */
  list(): Promise<Supply[]>
  /** Owner only: cost prices by supply id. */
  costs(): Promise<Record<string, number>>
  /** Owner only. */
  upsert(input: SupplyInput): Promise<Supply>
  /** Owner only. Refused with supply_in_use while an item on sale uses it. */
  archive(supplyId: string): Promise<void>
  restore(supplyId: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Stock (owner only)
// ---------------------------------------------------------------------------

export interface StockMovement {
  id: string
  /** Exactly one of itemId and supplyId is set. */
  itemId: string | null
  supplyId: string | null
  /** The item's or the supply's name. */
  itemName: string
  /** For a supply used by a sale (or returned by a void): the item that used it. */
  sourceItemId: string | null
  sourceItemName: string | null
  type: MovementType
  /** Positive adds stock, negative removes it. */
  delta: number
  quantityBefore: number
  quantityAfter: number
  reason: AdjustReason | null
  note: string | null
  orderId: string | null
  orderNumber: number | null
  restockId: string | null
  supplier: string | null
  unitCost: number | null
  createdById: string | null
  createdByName: string
  dateKey: string
  createdAt: string
}

export interface MovementFilter {
  itemId?: string
  supplyId?: string
  type?: MovementType
  /** Business days, "YYYY-MM-DD", inclusive. */
  from?: string
  to?: string
  userId?: string
  offset?: number
  limit?: number
}

export interface Page<Row> {
  rows: Row[]
  /** How many match the filter in total. */
  total: number
}

export interface RestockInput {
  /** Chosen by the app once per delivery form: saving twice never adds stock twice. */
  clientId: string
  /** The business day it arrived, "YYYY-MM-DD". Not in the future. */
  receivedOn: string
  supplier: string
  note: string
  lines: RestockLine[]
}

/** Adjusts an item's own stock or a supply: exactly one of itemId and supplyId. */
export interface AdjustInput {
  itemId?: string
  supplyId?: string
  countedQuantity: number
  /** The quantity shown when counting started. Refused with conflict if stock changed since. */
  expectedQuantity: number
  reason: AdjustReason
  /** Required when the reason is "other". */
  note: string
}

export interface StockApi {
  restock(input: RestockInput): Promise<{ restockId: string }>
  /** Returns the new quantity. */
  adjust(input: AdjustInput): Promise<{ quantity: number }>
  /** Newest first. */
  movements(filter: MovementFilter): Promise<Page<StockMovement>>
}

// ---------------------------------------------------------------------------
// Reports (owner only)
// ---------------------------------------------------------------------------

export interface Dashboard {
  today: DaySummary
  yesterday: DaySummary
  topItemsToday: ItemSales[]
  /** Items on sale that count their own stock, at or below their low-stock level, emptiest first. */
  lowStock: Item[]
  /** Supplies at or below their low-stock level, emptiest first. */
  lowSupplies: Supply[]
}

/** The most orders one CSV export returns. A longer range is cut short and says so. */
export const EXPORT_MAX_ORDERS = 5000

export interface OrderExport {
  /** Oldest first, as a spreadsheet reads. */
  orders: Order[]
  /** True when the range had more than EXPORT_MAX_ORDERS orders. */
  truncated: boolean
}

export interface ReportsApi {
  /** Owner only. */
  dashboard(): Promise<Dashboard>
  /** Owner only. At most REPORT_MAX_DAYS days. */
  summary(range: ReportRange): Promise<SalesReport>
  /** Owner only. Every order in the range, completed and voided, for a CSV file. */
  exportOrders(range: ReportRange): Promise<OrderExport>
}

// ---------------------------------------------------------------------------
// Business settings (everyone in the business reads them; owners change them)
// ---------------------------------------------------------------------------

export interface BusinessSettings {
  id: string
  name: string
  businessCode: string
  currencyCode: string
  timezone: string
  address: string | null
  phone: string | null
  receiptFooter: string | null
  defaultLowStockLevel: number
  /** A small image (data URL) in demo mode; a stored file on Supabase. */
  logoUrl: string | null
  /** The faint mark behind receipts: Tallybox by default, the owner's own, or none. */
  watermark: WatermarkSettings
  accessEndsAt: string | null
}

export interface BusinessSettingsInput {
  name: string
  currencyCode: string
  timezone: string
  address: string
  phone: string
  receiptFooter: string
  defaultLowStockLevel: number
  /** Leave out to keep the current logo; null removes it; a data URL sets a new one. */
  logo?: string | null
  /** Text is the owner's own watermark words ('' for none); see domain/receiptWatermark. */
  watermark: { kind: WatermarkKind; text: string; useLogo: boolean }
}

export interface BusinessApi {
  get(): Promise<BusinessSettings>
  update(input: BusinessSettingsInput): Promise<BusinessSettings>
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderStatus = 'completed' | 'voided'

export interface OrderLine {
  itemId: string
  /** Snapshot when the order was confirmed. */
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

export interface Order {
  id: string
  orderNumber: number
  status: OrderStatus
  staffId: string
  staffName: string
  /** Minor units. */
  total: number
  paymentMethod: PaymentMethod
  paymentReference: string | null
  paymentConfirmedByName: string
  paymentConfirmedAt: string
  customerName: string | null
  customerPhone: string | null
  note: string | null
  /** The business's own calendar day, "YYYY-MM-DD". */
  dateKey: string
  createdAt: string
  voidedAt: string | null
  voidedByName: string | null
  voidReason: string | null
  lines: OrderLine[]
}

export interface CreateOrderInput {
  /** Chosen by the app once per cart: confirming twice with it never makes two orders. */
  clientOrderId: string
  lines: CartLine[]
  paymentMethod: PaymentMethod
  paymentReference: string
  /** Must be true: ticked only after checking the money has really arrived. */
  paymentConfirmed: boolean
  customerName: string
  customerPhone: string
  note: string
  /** The held order this came from, which is removed in the same step. */
  heldOrderId?: string | null
}

export interface OrdersApi {
  /**
   * Confirms an order: checks payment was confirmed and stock for every line,
   * takes names and prices from the item list, reduces stock. Throws
   * payment_not_confirmed, insufficient_stock (details.problems for own stock,
   * details.supplyProblems for shared supplies) or
   * item_unavailable (details.names).
   */
  create(input: CreateOrderInput): Promise<Order>
  /** Today's orders taken by the signed-in person, newest first. */
  listMine(): Promise<Order[]>
  /** Staff may open only their own orders from today. */
  get(orderId: string): Promise<Order>
  /** Owner only: every order in a date range, newest first, filtered and paged. */
  list(filter: OrderFilter): Promise<Page<Order>>
  /** Owner only. Completed orders only; returns the stock and keeps the order as voided. */
  void(input: { orderId: string; reason: string }): Promise<Order>
}

export interface OrderFilter {
  /** Business days, "YYYY-MM-DD", inclusive. */
  from: string
  to: string
  staffId?: string
  status?: OrderStatus
  paymentMethod?: PaymentMethod
  /** An order number, with or without "#". */
  search?: string
  offset?: number
  limit?: number
}

// ---------------------------------------------------------------------------
// Held orders: a cart saved while waiting for payment. Takes no stock.
// ---------------------------------------------------------------------------

export interface HeldOrderLine {
  itemId: string
  quantity: number
  /** Current details of the item, for display. A hold stores only item and quantity. */
  name: string
  unitPrice: number
  /** How many can be sold now. Null when nothing limits it. */
  available: number | null
  active: boolean
}

export interface HeldOrder {
  id: string
  staffId: string
  staffName: string
  customerName: string | null
  customerPhone: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  lines: HeldOrderLine[]
  /** At today's prices. */
  total: number
}

export interface SaveHeldOrderInput {
  /** Update this hold instead of creating a new one. */
  heldOrderId?: string | null
  lines: CartLine[]
  customerName: string
  customerPhone: string
  note: string
}

export interface HeldOrdersApi {
  /** Staff see their own holds. Owners see everyone's. Newest first. */
  list(): Promise<HeldOrder[]>
  save(input: SaveHeldOrderInput): Promise<HeldOrder>
  /** Staff may discard their own holds; owners any. */
  discard(heldOrderId: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Staff accounts (owner)
// ---------------------------------------------------------------------------

export interface StaffMember {
  id: string
  displayName: string
  username: string
  active: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface NewStaffInput {
  displayName: string
  username: string
  password: string
}

export interface StaffApi {
  list(): Promise<StaffMember[]>
  create(input: NewStaffInput): Promise<StaffMember>
  /** Owner only: a new temporary password for a staff member who forgot theirs. */
  resetPassword(input: { staffId: string; newPassword: string }): Promise<void>
  /** Owner only: a turned-off account cannot sign in, and is signed out. Never deleted. */
  setActive(input: { staffId: string; active: boolean }): Promise<StaffMember>
}

// ---------------------------------------------------------------------------
// Developer portal (super-admin only; everyone else gets not_found)
// ---------------------------------------------------------------------------

export interface AdminBusiness {
  id: string
  name: string
  businessCode: string
  status: BusinessStatus
  accessEndsAt: string | null
  accessFilter: AccessFilter
  createdAt: string
  ownerName: string | null
  ownerEmail: string | null
  staffCount: number
  lastActivityAt: string | null
  suspendedAt: string | null
  suspendedReason: string | null
}

export interface AdminBusinessDetail extends AdminBusiness {
  activeStaffCount: number
  orderCount: number
  orderCountToday: number
  phone: string | null
  timezone: string
  currencyCode: string
}

export interface PlatformCounts {
  businesses: number
  suspended: number
  endingSoon: number
  accessEnded: number
  staff: number
  unusedCodes: number
}

export interface AdminActivationCode {
  id: string
  ownerEmail: string
  note: string | null
  status: CodeStatus
  createdAt: string
  redeemBy: string
  /** Access length the business will get. Null means open-ended. */
  accessDays: number | null
  usedAt: string | null
  usedByBusinessName: string | null
}

export interface GenerateCodeInput {
  ownerEmail: string
  note: string
  redeemDays: number
  accessDays: number | null
}

/** The only time the code itself is ever returned. */
export interface GeneratedCode {
  id: string
  code: string
  ownerEmail: string
  redeemBy: string
  accessDays: number | null
}

export interface OwnerResetLink {
  url: string
  expiresAt: string
  ownerEmail: string
  /** True in demo mode: the link only explains itself, it resets nothing. */
  simulated: boolean
}

export interface AdminApi {
  listBusinesses(): Promise<AdminBusiness[]>
  getBusiness(businessId: string): Promise<AdminBusinessDetail>
  platformCounts(): Promise<PlatformCounts>
  /** A suspension needs a reason. */
  setBusinessStatus(input: {
    businessId: string
    status: BusinessStatus
    reason?: string
  }): Promise<void>
  /** Adds days from the later of now and the current end. Null days makes access open-ended. */
  extendAccess(input: {
    businessId: string
    days: number | null
  }): Promise<{ accessEndsAt: string | null }>
  createOwnerResetLink(businessId: string): Promise<OwnerResetLink>
  listActivationCodes(): Promise<AdminActivationCode[]>
  generateActivationCode(input: GenerateCodeInput): Promise<GeneratedCode>
  revokeActivationCode(codeId: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Demo tools (mock only)
// ---------------------------------------------------------------------------

export interface DemoAccount {
  label: string
  portal: 'owner' | 'staff'
  email?: string
  businessCode?: string
  username?: string
  password: string
  /** Shown next to the account, for example "turned off". */
  hint?: string
}

export interface DemoApi {
  accounts: readonly DemoAccount[]
  /** Puts every piece of demo data back to the starting set and signs out. */
  reset(): Promise<void>
}

// ---------------------------------------------------------------------------

export type DataSource = 'mock' | 'supabase'

export interface TallyboxApi {
  readonly source: DataSource
  /** True when sign-in and registration need a Turnstile token. */
  readonly requiresCaptcha: boolean
  auth: AuthApi
  registration: RegistrationApi
  staff: StaffApi
  items: ItemsApi
  orders: OrdersApi
  held: HeldOrdersApi
  stock: StockApi
  supplies: SuppliesApi
  reports: ReportsApi
  business: BusinessApi
  admin: AdminApi
  /** Present only for the mock. */
  demo: DemoApi | null
}
