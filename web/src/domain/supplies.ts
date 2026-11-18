import type { CartLine } from './orders'

/**
 * Shared supplies: stock counted by packaging or materials, like 300 ml bottles
 * used by several drinks. Each item chooses how its stock is counted:
 *   - its own stock (on by default),
 *   - shared supplies (off by default): each unit sold also uses whole numbers
 *     of one or more supplies,
 *   - both, or neither (not tracked, for example food made to order).
 *
 * Pure functions, used by the screens, the mock data layer and (in SQL) the
 * database, so every place agrees on what can be sold.
 */

export const SUPPLY_LIMITS = {
  nameMax: 80,
  unitMax: 20,
  maxUnitsPerSale: 1000,
  /** Supplies one item may use. */
  maxPerItem: 10,
} as const

export interface SupplyUse {
  supplyId: string
  /** Whole number, at least 1. */
  unitsPerSale: number
}

export interface SupplyFacts {
  id: string
  name: string
  unit: string | null
  quantity: number
  active: boolean
}

export interface SellableFacts {
  id: string
  name: string
  tracksOwnStock: boolean
  /** Own stock. Ignored when the item doesn't count its own stock. */
  quantity: number
  supplies: readonly SupplyUse[]
}

/** True when a list of supply uses is well formed: each supply once, whole counts in range. */
export function validSupplyUses(uses: readonly SupplyUse[]): boolean {
  if (uses.length > SUPPLY_LIMITS.maxPerItem) return false
  if (new Set(uses.map((use) => use.supplyId)).size !== uses.length) return false
  return uses.every(
    (use) =>
      typeof use.supplyId === 'string' &&
      use.supplyId !== '' &&
      Number.isInteger(use.unitsPerSale) &&
      use.unitsPerSale >= 1 &&
      use.unitsPerSale <= SUPPLY_LIMITS.maxUnitsPerSale,
  )
}

/** How many of a supply allow selling, given units per sale. Archived or missing supplies allow none. */
function salesFromSupply(
  use: SupplyUse,
  suppliesById: ReadonlyMap<string, SupplyFacts>,
  alreadyUsed = 0,
): number {
  const supply = suppliesById.get(use.supplyId)
  if (!supply || !supply.active) return 0
  return Math.floor(Math.max(0, supply.quantity - alreadyUsed) / use.unitsPerSale)
}

/**
 * How many of an item can be sold now: the lowest of its own stock (if it counts
 * it) and, for each supply it uses, supply quantity ÷ units per sale, rounded down.
 * Null when nothing limits it (neither own stock nor supplies).
 */
export function availableToSell(
  item: SellableFacts,
  suppliesById: ReadonlyMap<string, SupplyFacts>,
): number | null {
  let limit: number | null = item.tracksOwnStock ? Math.max(0, item.quantity) : null
  for (const use of item.supplies) {
    const fromSupply = salesFromSupply(use, suppliesById)
    limit = limit === null ? fromSupply : Math.min(limit, fromSupply)
  }
  return limit
}

/** What a cart needs from each supply, all lines added up. */
export function supplyNeeds(
  lines: readonly CartLine[],
  itemsById: ReadonlyMap<string, SellableFacts>,
): Map<string, number> {
  const needs = new Map<string, number>()
  for (const line of lines) {
    const item = itemsById.get(line.itemId)
    if (!item) continue
    for (const use of item.supplies) {
      needs.set(use.supplyId, (needs.get(use.supplyId) ?? 0) + line.quantity * use.unitsPerSale)
    }
  }
  return needs
}

/**
 * How many more of an item fit in the cart, counting what the other lines
 * already use from shared supplies. Null when nothing limits it.
 */
export function roomInCart(
  itemId: string,
  lines: readonly CartLine[],
  itemsById: ReadonlyMap<string, SellableFacts>,
  suppliesById: ReadonlyMap<string, SupplyFacts>,
): number | null {
  const item = itemsById.get(itemId)
  if (!item) return 0
  const inCart = lines.find((line) => line.itemId === itemId)?.quantity ?? 0
  const needs = supplyNeeds(lines, itemsById)
  let room: number | null = item.tracksOwnStock ? Math.max(0, item.quantity - inCart) : null
  for (const use of item.supplies) {
    const fromSupply = salesFromSupply(use, suppliesById, needs.get(use.supplyId) ?? 0)
    room = room === null ? fromSupply : Math.min(room, fromSupply)
  }
  return room
}

export interface SupplyProblem {
  supplyId: string
  name: string
  unit: string | null
  needed: number
  available: number
  /** The items in the cart that use this supply. */
  itemNames: string[]
}

/** Supplies the cart needs more of than there is, after adding up every line. */
export function supplyProblems(
  lines: readonly CartLine[],
  itemsById: ReadonlyMap<string, SellableFacts>,
  suppliesById: ReadonlyMap<string, SupplyFacts>,
): SupplyProblem[] {
  const problems: SupplyProblem[] = []
  for (const [supplyId, needed] of supplyNeeds(lines, itemsById)) {
    const supply = suppliesById.get(supplyId)
    const available = supply && supply.active ? Math.max(0, supply.quantity) : 0
    if (needed <= available) continue
    problems.push({
      supplyId,
      name: supply?.name ?? 'A supply',
      unit: supply?.unit ?? null,
      needed,
      available,
      itemNames: lines
        .map((line) => itemsById.get(line.itemId))
        .filter((item) => item?.supplies.some((use) => use.supplyId === supplyId))
        .map((item) => item!.name),
    })
  }
  return problems
}

/** "Coke", "Coke and Fanta", "Coke, Fanta and Apple juice". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** "Not enough 300 ml bottle: 30 needed, 15 left. Coke and Apple juice use it." */
export function describeSupplyProblem(problem: SupplyProblem): string {
  const left = problem.available === 0 ? 'none left' : `${problem.available} left`
  const users =
    problem.itemNames.length === 0
      ? ''
      : ` ${joinNames(problem.itemNames)} ${problem.itemNames.length === 1 ? 'uses' : 'use'} it.`
  return `Not enough ${problem.name}: ${problem.needed} needed, ${left}.${users}`
}

/** One deduction from a supply, caused by one order line. Each becomes its own ledger entry. */
export interface SupplyDeduction {
  supplyId: string
  itemId: string
  quantity: number
}

/** The supply deductions for a priced, checked cart, line by line. */
export function supplyDeductions(
  lines: readonly CartLine[],
  itemsById: ReadonlyMap<string, SellableFacts>,
): SupplyDeduction[] {
  return lines.flatMap((line) =>
    (itemsById.get(line.itemId)?.supplies ?? []).map((use) => ({
      supplyId: use.supplyId,
      itemId: line.itemId,
      quantity: line.quantity * use.unitsPerSale,
    })),
  )
}

/** How an item counts stock, in words, for item screens. */
export function stockModeLabel(item: {
  tracksOwnStock: boolean
  supplies: readonly unknown[]
}): string {
  const own = item.tracksOwnStock
  const shared = item.supplies.length > 0
  if (own && shared) return 'Own stock and shared supplies'
  if (own) return 'Own stock'
  if (shared) return 'Shared supplies'
  return 'Not counted'
}
