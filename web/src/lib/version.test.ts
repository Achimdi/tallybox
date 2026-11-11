import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersionFile, updateStatus } from './version'

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0)
  })

  it('ignores a pre-release suffix', () => {
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(0)
  })
})

describe('parseVersionFile', () => {
  it('accepts a well-formed file', () => {
    expect(parseVersionFile({ version: '0.2.0', minVersion: '0.1.0' })).toEqual({
      version: '0.2.0',
      minVersion: '0.1.0',
    })
  })

  it('rejects anything else, such as an HTML fallback page', () => {
    expect(parseVersionFile('<!doctype html>')).toBeNull()
    expect(parseVersionFile(null)).toBeNull()
    expect(parseVersionFile({ version: '0.2.0' })).toBeNull()
    expect(parseVersionFile({ version: 'latest', minVersion: '0.1.0' })).toBeNull()
  })
})

describe('updateStatus', () => {
  it('is current when running the deployed version', () => {
    expect(updateStatus('0.2.0', { version: '0.2.0', minVersion: '0.1.0' })).toBe('current')
  })

  it('offers a normal update when a newer version is deployed', () => {
    expect(updateStatus('0.2.0', { version: '0.3.0', minVersion: '0.1.0' })).toBe('available')
  })

  it('requires an update when the running version is below the minimum', () => {
    expect(updateStatus('0.2.0', { version: '0.4.0', minVersion: '0.3.0' })).toBe('required')
  })
})
