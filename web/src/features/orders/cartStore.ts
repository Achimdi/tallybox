import { useMemo, useSyncExternalStore } from 'react'
import type { HeldOrder } from '@/api/types'
import {
  addToCart,
  isPaymentMethod,
  setCartQuantity,
  type CartLine,
  type PaymentMethod,
} from '@/domain/orders'
import { readStored, removeStored, writeStored } from '@/lib/storage'

/**
 * The cart being built on New order.
 *
 * Kept per person in this tab's session storage, so it survives a reload or a
 * trip to another screen, and disappears when the tab is closed. It holds no
 * prices: those always come from the item list.
 */

export interface CartState {
  lines: CartLine[]
  customerName: string
  customerPhone: string
  note: string
  paymentMethod: PaymentMethod | null
  paymentReference: string
  /** Ticked only after checking the money has arrived. Cleared whenever the cart changes. */
  paymentConfirmed: boolean
  /** One id per cart, so confirming twice never makes two orders. */
  clientOrderId: string
  /** Set when the cart was resumed from a held order. */
  heldOrderId: string | null
}

function emptyCart(): CartState {
  return {
    lines: [],
    customerName: '',
    customerPhone: '',
    note: '',
    paymentMethod: null,
    paymentReference: '',
    paymentConfirmed: false,
    clientOrderId: crypto.randomUUID(),
    heldOrderId: null,
  }
}

const storageKey = (userId: string) => `tb.cart.${userId}`
const cache = new Map<string, CartState>()
const listeners = new Set<() => void>()

function parse(raw: string | null): CartState | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<CartState>
    if (!Array.isArray(value.lines) || typeof value.clientOrderId !== 'string') return null
    return {
      ...emptyCart(),
      ...value,
      paymentMethod: isPaymentMethod(value.paymentMethod) ? value.paymentMethod : null,
      lines: value.lines.filter(
        (line): line is CartLine =>
          typeof line?.itemId === 'string' && Number.isInteger(line.quantity) && line.quantity > 0,
      ),
    }
  } catch {
    return null
  }
}

function read(userId: string): CartState {
  const cached = cache.get(userId)
  if (cached) return cached
  const state = parse(readStored('session', storageKey(userId))) ?? emptyCart()
  cache.set(userId, state)
  return state
}

function write(userId: string, state: CartState): void {
  cache.set(userId, state)
  if (state.lines.length === 0 && !state.heldOrderId) removeStored('session', storageKey(userId))
  else writeStored('session', storageKey(userId), JSON.stringify(state))
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Replaces the cart with a held order, ready to edit and confirm. */
export function loadHeldIntoCart(userId: string, held: HeldOrder): void {
  write(userId, {
    ...emptyCart(),
    lines: held.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
    customerName: held.customerName ?? '',
    customerPhone: held.customerPhone ?? '',
    note: held.note ?? '',
    heldOrderId: held.id,
  })
}

export function cartIsEmpty(userId: string): boolean {
  return read(userId).lines.length === 0
}

/** For tests: forget every cart. */
export function resetCarts(): void {
  cache.clear()
  for (const listener of listeners) listener()
}

export function useCart(userId: string) {
  const state = useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => read(userId),
  )

  const actions = useMemo(() => {
    const update = (change: (current: CartState) => CartState) =>
      write(userId, change(read(userId)))
    // A changed cart means a different amount: the payment tick must be given again.
    const changeLines = (lines: CartLine[]) =>
      update((current) => ({ ...current, lines, paymentConfirmed: false }))
    return {
      add: (itemId: string, available: number) =>
        changeLines(addToCart(read(userId).lines, itemId, available)),
      setQuantity: (itemId: string, quantity: number) =>
        changeLines(setCartQuantity(read(userId).lines, itemId, quantity)),
      setFields: (fields: Partial<Omit<CartState, 'lines' | 'clientOrderId' | 'heldOrderId'>>) =>
        update((current) => ({ ...current, ...fields })),
      /** After confirming or holding: a fresh, empty cart. */
      clear: () => write(userId, emptyCart()),
    }
  }, [userId])

  return { cart: state, ...actions }
}
