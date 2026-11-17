import { deviceId as browserDeviceId } from '@/lib/device'
import { env, looksLikeSecretKey } from '@/lib/env'
import { AppError } from '@/lib/errors'
import type { TallyboxApi } from '../types'
import { createAccountsApi } from './accounts'
import { createTallyboxClient, type SupabaseApiOptions } from './client'
import { createOrdersApi } from './orders'
import { createStockApi } from './stock'

/**
 * The Supabase implementation of TallyboxApi (Phase 2).
 *
 * Built feature by feature, each part passing the same contract tests as the
 * demo: 2A sign-in, registration, staff accounts and the developer portal (done);
 * 2B items, supplies and stock (done); 2C orders, held orders and
 * reading business details for receipts (done); 2D reports, staff management and
 * settings. Parts not built yet answer "not set up yet".
 */

const notYet = (): Promise<never> => Promise.reject(new AppError('config_missing'))

/** Options from this build's environment, for the browser. */
export function browserSupabaseOptions(): SupabaseApiOptions {
  return {
    url: env.supabaseUrl ?? '',
    publishableKey: env.supabasePublishableKey ?? '',
    staffEmailDomain: env.staffEmailDomain,
    deviceId: browserDeviceId,
    isOnline: () => navigator.onLine,
  }
}

export function createSupabaseApi(
  options: SupabaseApiOptions = browserSupabaseOptions(),
): TallyboxApi {
  // Without settings (or with a secret key by mistake) the app still starts:
  // every call answers "not set up yet" and the screens say so.
  const configured =
    Boolean(options.url && options.publishableKey) && !looksLikeSecretKey(options.publishableKey)
  if (!configured) return notConfigured()

  const client = createTallyboxClient(options)
  const { auth, registration, staff, admin } = createAccountsApi(client, options)
  const { items, supplies, stock } = createStockApi(client, options)
  const { orders, held, business } = createOrdersApi(client, options, { items, supplies })

  return {
    source: 'supabase',
    requiresCaptcha: true,
    auth,
    registration,
    staff,
    items,
    orders,
    held,
    stock,
    supplies,
    reports: { dashboard: notYet, summary: notYet, exportOrders: notYet },
    business: { get: business.get, update: notYet },
    admin,
    demo: null,
  }
}

/** Every call answers "not set up yet". */
function notConfigured(): TallyboxApi {
  return {
    source: 'supabase',
    requiresCaptcha: true,
    auth: { signIn: notYet, getSession: notYet, signOut: notYet, changePassword: notYet },
    registration: { isBusinessCodeAvailable: notYet, registerBusiness: notYet },
    staff: { list: notYet, create: notYet, resetPassword: notYet, setActive: notYet },
    items: {
      list: notYet,
      costs: notYet,
      upsert: notYet,
      archive: notYet,
      restore: notYet,
      stockModeChanges: notYet,
    },
    orders: { create: notYet, listMine: notYet, get: notYet, list: notYet, void: notYet },
    held: { list: notYet, save: notYet, discard: notYet },
    stock: { restock: notYet, adjust: notYet, movements: notYet },
    supplies: { list: notYet, costs: notYet, upsert: notYet, archive: notYet, restore: notYet },
    reports: { dashboard: notYet, summary: notYet, exportOrders: notYet },
    business: { get: notYet, update: notYet },
    admin: {
      listBusinesses: notYet,
      getBusiness: notYet,
      platformCounts: notYet,
      setBusinessStatus: notYet,
      extendAccess: notYet,
      createOwnerResetLink: notYet,
      listActivationCodes: notYet,
      generateActivationCode: notYet,
      revokeActivationCode: notYet,
    },
    demo: null,
  }
}
