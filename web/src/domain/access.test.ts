import { describe, expect, it } from 'vitest'
import {
  ACCESS_GRACE_DAYS,
  accessEndFromCode,
  accessEndsSoon,
  accessFilterFor,
  businessAccessState,
  DAY_MS,
  daysUntilAccessEnds,
  extendAccessEnd,
  isValidAccessDays,
} from './access'

const NOW = new Date('2026-11-13T12:00:00Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString()

describe('businessAccessState', () => {
  it('lets an active business with open-ended access in', () => {
    expect(businessAccessState({ status: 'active', accessEndsAt: null }, NOW)).toBe('ok')
  })

  it('reports a suspension first, whatever the access period says', () => {
    expect(businessAccessState({ status: 'suspended', accessEndsAt: inDays(100) }, NOW)).toBe(
      'suspended',
    )
    expect(businessAccessState({ status: 'suspended', accessEndsAt: inDays(-100) }, NOW)).toBe(
      'suspended',
    )
  })

  it('keeps access open through the grace period after the end date', () => {
    expect(businessAccessState({ status: 'active', accessEndsAt: inDays(-1) }, NOW)).toBe('ok')
    expect(
      businessAccessState(
        { status: 'active', accessEndsAt: inDays(-ACCESS_GRACE_DAYS + 0.01) },
        NOW,
      ),
    ).toBe('ok')
  })

  it('locks the business once the grace period is over', () => {
    expect(
      businessAccessState({ status: 'active', accessEndsAt: inDays(-ACCESS_GRACE_DAYS) }, NOW),
    ).toBe('ended')
    expect(businessAccessState({ status: 'active', accessEndsAt: inDays(-30) }, NOW)).toBe('ended')
  })
})

describe('access warnings and filters', () => {
  it('counts whole days left', () => {
    expect(daysUntilAccessEnds(null, NOW)).toBeNull()
    expect(daysUntilAccessEnds(inDays(5), NOW)).toBe(5)
    expect(daysUntilAccessEnds(inDays(0.5), NOW)).toBe(1)
    expect(daysUntilAccessEnds(inDays(-2), NOW)).toBe(-2)
  })

  it('warns within 7 days, and never for open-ended access', () => {
    expect(accessEndsSoon(inDays(7), NOW)).toBe(true)
    expect(accessEndsSoon(inDays(8), NOW)).toBe(false)
    expect(accessEndsSoon(inDays(-1), NOW)).toBe(true)
    expect(accessEndsSoon(null, NOW)).toBe(false)
  })

  it('sorts businesses for the developer filters', () => {
    expect(accessFilterFor({ status: 'active', accessEndsAt: null }, NOW)).toBe('ok')
    expect(accessFilterFor({ status: 'active', accessEndsAt: inDays(3) }, NOW)).toBe('ending_soon')
    expect(accessFilterFor({ status: 'active', accessEndsAt: inDays(-10) }, NOW)).toBe('ended')
    // A suspended business still shows its access situation.
    expect(accessFilterFor({ status: 'suspended', accessEndsAt: inDays(-10) }, NOW)).toBe('ended')
  })
})

describe('setting and extending access', () => {
  it('starts access when the business registers', () => {
    expect(accessEndFromCode(30, NOW)).toBe(inDays(30))
    expect(accessEndFromCode(null, NOW)).toBeNull()
  })

  it('adds days to the current end date when extending early', () => {
    expect(extendAccessEnd(inDays(5), 30, NOW)).toBe(inDays(35))
  })

  it('adds days from today when access has already ended', () => {
    expect(extendAccessEnd(inDays(-20), 30, NOW)).toBe(inDays(30))
  })

  it('can make access open-ended, or give an open-ended business an end date', () => {
    expect(extendAccessEnd(inDays(5), null, NOW)).toBeNull()
    expect(extendAccessEnd(null, 90, NOW)).toBe(inDays(90))
  })

  it('accepts whole numbers of days within reason', () => {
    expect(isValidAccessDays(30)).toBe(true)
    expect(isValidAccessDays(0)).toBe(false)
    expect(isValidAccessDays(1.5)).toBe(false)
    expect(isValidAccessDays(5000)).toBe(false)
  })
})
