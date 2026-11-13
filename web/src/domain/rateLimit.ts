/**
 * A fixed-window counter: at most `max` attempts per window for one key.
 * Pure: it takes the current counters and returns the new ones.
 */

export interface RateWindow {
  windowStart: number
  count: number
}

export type RateCounters = Record<string, RateWindow>

export interface RateResult {
  allowed: boolean
  counters: RateCounters
}

export function hitRateLimit(
  counters: RateCounters,
  key: string,
  max: number,
  windowMs: number,
  nowMs: number,
): RateResult {
  const windowStart = Math.floor(nowMs / windowMs) * windowMs
  const current = counters[key]
  const count = current && current.windowStart === windowStart ? current.count + 1 : 1

  // Drop windows that have closed, so the counters never grow without end.
  const next: RateCounters = {}
  for (const [otherKey, window] of Object.entries(counters)) {
    if (window.windowStart >= windowStart) next[otherKey] = window
  }
  next[key] = { windowStart, count }

  return { allowed: count <= max, counters: next }
}
