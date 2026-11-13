/**
 * TallyboxApi: the ONE way screens get and change data.
 *
 * No component talks to a data source directly. There are two implementations:
 *   - mock      (Phase 1): demo data kept in this browser, enforcing the real rules
 *   - supabase  (Phase 2): the real backend
 * `VITE_DATA_SOURCE` picks one. Both must pass the same contract tests
 * (src/api/contract), so swapping them changes nothing the screens can see.
 *
 * Rules for every method:
 *   - It acts as the person who is signed in (like a real server would).
 *   - It fails only with an AppError carrying a known code (src/lib/errors.ts).
 *   - Dates are ISO strings. Money is whole minor units.
 *
 * Step 1A covers sign-in, registration, staff accounts and the developer
 * portal. Items, stock, orders, reports and settings are added in 1B and 1C.
 */

import type { AccessFilter, BusinessStatus } from '@/domain/access'
import type { CodeStatus } from '@/domain/activationCodes'

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
  admin: AdminApi
  /** Present only for the mock. */
  demo: DemoApi | null
}
