import { AppError } from '@/lib/errors'
import type { TallyboxApi } from '../types'

/**
 * The Supabase implementation of TallyboxApi: an empty stub until Phase 2.
 *
 * Phase 2 fills this in feature by feature (auth and developer portal, items
 * and stock, orders and receipts, reports and settings). The database
 * migrations, Edge Functions and their tests written early are parked on the
 * `backend-draft` branch. Until then, every call answers "not set up yet".
 */

const notYet = (): Promise<never> => Promise.reject(new AppError('config_missing'))

export function createSupabaseApi(): TallyboxApi {
  return {
    source: 'supabase',
    requiresCaptcha: true,
    auth: { signIn: notYet, getSession: notYet, signOut: notYet },
    registration: { isBusinessCodeAvailable: notYet, registerBusiness: notYet },
    staff: { list: notYet, create: notYet },
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
