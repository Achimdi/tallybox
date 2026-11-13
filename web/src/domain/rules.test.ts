import {
  businessCodeProblem,
  compactActivationCode,
  formatActivationCode,
  isValidBusinessCode,
  isValidUsername,
  isWellFormedActivationCode,
  normalizeBusinessCode,
  staffEmail,
} from '@/domain/rules'
import { describe, expect, it } from 'vitest'

/**
 * The rules shared by the web app and the Edge Functions. The database has the
 * same rules again (supabase/tests/020_onboarding.sql checks those).
 */

describe('business codes', () => {
  it('accepts lowercase letters, digits and inner hyphens, 3 to 20 characters', () => {
    for (const code of ['abc', 'adas-pharmacy', 'shop24', '24-7', 'a'.repeat(20)]) {
      expect(isValidBusinessCode(code), code).toBe(true)
    }
  })

  it('says exactly what is wrong', () => {
    expect(businessCodeProblem('ab')).toBe('too_short')
    expect(businessCodeProblem('a'.repeat(21))).toBe('too_long')
    expect(businessCodeProblem('My Shop')).toBe('characters')
    expect(businessCodeProblem('ada_shop')).toBe('characters')
    expect(businessCodeProblem('-shop')).toBe('hyphens')
    expect(businessCodeProblem('shop-')).toBe('hyphens')
    expect(businessCodeProblem('my--shop')).toBe('hyphens')
    expect(businessCodeProblem('admin')).toBe('reserved')
    expect(businessCodeProblem('tallybox')).toBe('reserved')
  })

  it('normalizes what people type', () => {
    expect(normalizeBusinessCode('  Adas-Pharmacy ')).toBe('adas-pharmacy')
  })
})

describe('usernames', () => {
  it('accepts simple names', () => {
    for (const name of ['ada', 'chidi', 'ada.obi', 'till-2', 'staff_1', 'a1b']) {
      expect(isValidUsername(name), name).toBe(true)
    }
  })

  it('refuses anything that would make a bad sign-in address', () => {
    for (const name of ['ab', 'a'.repeat(21), 'Ada', 'ada obi', '.ada', 'ada.', 'a..b', 'ada@x']) {
      expect(isValidUsername(name), name).toBe(false)
    }
  })
})

describe('staffEmail', () => {
  it('builds the same made-up address on both sides', () => {
    expect(staffEmail('chidi', 'adas-pharmacy')).toBe('chidi@adas-pharmacy.staff.tallybox.invalid')
  })

  it('ignores case and outer spaces, so sign-in is forgiving', () => {
    expect(staffEmail(' Chidi ', ' Adas-Pharmacy ')).toBe(
      'chidi@adas-pharmacy.staff.tallybox.invalid',
    )
  })

  it('uses another domain when one is configured', () => {
    expect(staffEmail('chidi', 'shop', 'example.com')).toBe('chidi@shop.staff.example.com')
  })
})

describe('activation codes', () => {
  it('reads a code however it was typed', () => {
    expect(compactActivationCode('tb-7k4m x9qd')).toBe('TB7K4MX9QD')
    expect(isWellFormedActivationCode(' tb-7k4m-x9qd ')).toBe(true)
    expect(formatActivationCode('tb7k4mx9qd')).toBe('TB-7K4M-X9QD')
  })

  it('refuses codes with look-alike characters or the wrong length', () => {
    // 0, O, 1 and I are never used in codes.
    for (const code of ['TB-0K4M-X9QD', 'TB-OK4M-X9QD', 'TB-1K4M-X9QD', 'TB-IK4M-X9QD']) {
      expect(isWellFormedActivationCode(code), code).toBe(false)
    }
    expect(isWellFormedActivationCode('TB-7K4M')).toBe(false)
    expect(isWellFormedActivationCode('XX-7K4M-X9QD')).toBe(false)
    expect(isWellFormedActivationCode('')).toBe(false)
  })
})
