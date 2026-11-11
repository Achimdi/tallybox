/**
 * Safe wrappers around localStorage and sessionStorage.
 *
 * Browser storage can be blocked (private windows, strict settings), and then
 * every call throws. These never throw: they just behave as if nothing is stored.
 *
 * Only store small, non-sensitive preferences here (a remembered business code,
 * a dismissed hint). Never store passwords or business data.
 */

type StorageKind = 'local' | 'session'

function storageFor(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readStored(kind: StorageKind, key: string): string | null {
  try {
    return storageFor(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeStored(kind: StorageKind, key: string, value: string): void {
  try {
    storageFor(kind)?.setItem(key, value)
  } catch {
    // Storage is full or blocked. The preference just won't be remembered.
  }
}

export function removeStored(kind: StorageKind, key: string): void {
  try {
    storageFor(kind)?.removeItem(key)
  } catch {
    // Nothing to do.
  }
}
