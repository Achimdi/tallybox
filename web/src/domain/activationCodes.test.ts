import { describe, expect, it } from 'vitest'
import { DAY_MS } from './access'
import {
  codeProblem,
  codeStatus,
  hashActivationCode,
  isValidRedeemDays,
  newActivationCode,
  redeemByFromDays,
  type CodeFacts,
} from './activationCodes'
import { hitRateLimit } from './rateLimit'
import { isWellFormedActivationCode } from './rules'

const NOW = new Date('2026-11-13T12:00:00Z')

const unused: CodeFacts = {
  status: 'unused',
  ownerEmail: 'ada@shop.test',
  redeemBy: new Date(NOW.getTime() + 7 * DAY_MS).toISOString(),
}

describe('newActivationCode', () => {
  it('makes well-formed codes with no look-alike characters', () => {
    for (let index = 0; index < 200; index += 1) {
      const code = newActivationCode()
      expect(code).toMatch(/^TB-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/)
      expect(isWellFormedActivationCode(code)).toBe(true)
    }
  })

  it('maps random bytes onto the alphabet evenly', () => {
    const bytes = new Uint8Array([0, 31, 32, 255, 1, 2, 3, 4])
    // 0 and 32 give the first character, 31 and 255 the last.
    expect(newActivationCode(() => bytes)).toBe('TB-2Z2Z-3456')
  })
})

describe('hashActivationCode', () => {
  it('gives the same hash however the code is typed', async () => {
    const hash = await hashActivationCode('TB-7K4M-X9QD')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashActivationCode(' tb-7k4m x9qd ')).toBe(hash)
    expect(await hashActivationCode('TB-7K4M-X9QE')).not.toBe(hash)
  })
})

describe('codeStatus and codeProblem', () => {
  it('accepts an unused code within its window, for its own email in any letter case', () => {
    expect(codeStatus(unused, NOW)).toBe('unused')
    expect(codeProblem(unused, ' ADA@shop.test ', NOW)).toBeNull()
  })

  it('treats a missing code and a wrong email the same', () => {
    expect(codeProblem(undefined, 'ada@shop.test', NOW)).toBe('activation_code_invalid')
    expect(codeProblem(unused, 'bola@shop.test', NOW)).toBe('activation_code_invalid')
  })

  it('reports used, revoked and expired codes', () => {
    expect(codeProblem({ ...unused, status: 'used' }, 'ada@shop.test', NOW)).toBe(
      'activation_code_used',
    )
    expect(codeProblem({ ...unused, status: 'revoked' }, 'ada@shop.test', NOW)).toBe(
      'activation_code_revoked',
    )
    const expired = { ...unused, redeemBy: NOW.toISOString() }
    expect(codeStatus(expired, NOW)).toBe('expired')
    expect(codeProblem(expired, 'ada@shop.test', NOW)).toBe('activation_code_expired')
  })

  it('sets the redeem window', () => {
    expect(redeemByFromDays(7, NOW)).toBe(unused.redeemBy)
    expect(isValidRedeemDays(7)).toBe(true)
    expect(isValidRedeemDays(0)).toBe(false)
    expect(isValidRedeemDays(91)).toBe(false)
  })
})

describe('hitRateLimit', () => {
  const HOUR = 3_600_000

  it('allows up to the limit within a window, then refuses', () => {
    let counters = {}
    const results: boolean[] = []
    for (let index = 0; index < 4; index += 1) {
      const result = hitRateLimit(counters, 'register:email:a', 3, HOUR, 1000)
      counters = result.counters
      results.push(result.allowed)
    }
    expect(results).toEqual([true, true, true, false])
  })

  it('counts each key separately and starts again in the next window', () => {
    let { counters } = hitRateLimit({}, 'a', 1, HOUR, 1000)
    expect(hitRateLimit(counters, 'b', 1, HOUR, 1000).allowed).toBe(true)
    expect(hitRateLimit(counters, 'a', 1, HOUR, 2000).allowed).toBe(false)
    ;({ counters } = hitRateLimit(counters, 'a', 1, HOUR, HOUR + 1))
    expect(counters.a).toEqual({ windowStart: HOUR, count: 1 })
  })
})
