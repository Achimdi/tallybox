import { readStored, writeStored } from './storage'

const DEVICE_KEY = 'tb.device'

/**
 * A random id for this browser, sent with public requests so the server can
 * limit repeated wrong attempts from one device. It identifies nothing else:
 * it is not tied to a person, and clearing site data resets it.
 */
export function deviceId(): string {
  const existing = readStored('local', DEVICE_KEY)
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing
  const created = crypto.randomUUID()
  writeStored('local', DEVICE_KEY, created)
  return created
}
