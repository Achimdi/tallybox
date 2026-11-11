/** The version of the running app, for example "0.1.0". Shown in the UI. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

/** The contents of /version.json, written at build time. */
export interface VersionFile {
  /** The newest deployed version. */
  version: string
  /** Any running copy older than this must update before continuing. */
  minVersion: string
}

function parts(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .split('-')[0]!
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
  return [major, minor, patch]
}

/** Returns a negative number if a < b, zero if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const left = parts(a)
  const right = parts(b)
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function parseVersionFile(value: unknown): VersionFile | null {
  if (typeof value !== 'object' || value === null) return null
  const { version, minVersion } = value as Record<string, unknown>
  const pattern = /^\d+\.\d+\.\d+/
  if (typeof version !== 'string' || !pattern.test(version)) return null
  if (typeof minVersion !== 'string' || !pattern.test(minVersion)) return null
  return { version, minVersion }
}

export type UpdateStatus = 'current' | 'available' | 'required'

/** Compares the running version with what the server says is deployed. */
export function updateStatus(running: string, file: VersionFile): UpdateStatus {
  if (compareVersions(running, file.minVersion) < 0) return 'required'
  if (compareVersions(running, file.version) < 0) return 'available'
  return 'current'
}

/** Fetches /version.json, bypassing every cache. Returns null if unavailable. */
export async function fetchVersionFile(signal?: AbortSignal): Promise<VersionFile | null> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      signal: signal ?? null,
    })
    if (!response.ok) return null
    return parseVersionFile(await response.json())
  } catch {
    // Offline, or the dev server (which has no version.json). Not an error.
    return null
  }
}
