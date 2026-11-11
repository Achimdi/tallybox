/**
 * The one front-end seam for plan limits. See docs/billing-plan.md.
 *
 * Every "can this business use this feature or add more?" question goes through
 * this hook. In v1 there are no subscriptions and no limits, so the answer is
 * always yes. Later, plan limits are enforced here (and by a matching check on
 * the server) without touching the screens that ask.
 *
 * This is a convenience for the UI, not security. The server decides.
 */

export type Feature = 'reports' | 'receipts' | 'held_orders' | 'csv_export'
export type Countable = 'staff' | 'items'

export interface Entitlements {
  /** May this business use the feature? */
  canUse: (feature: Feature) => boolean
  /** May this business add another one, given how many it has now? */
  canAdd: (thing: Countable, currentCount: number) => boolean
  /** The most allowed on this plan. Null means no limit. */
  limitFor: (thing: Countable) => number | null
}

const UNLIMITED: Entitlements = {
  canUse: () => true,
  canAdd: () => true,
  limitFor: () => null,
}

export function useEntitlements(): Entitlements {
  return UNLIMITED
}
