/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vitest runs from the web/ folder.
const tokensCss = readFileSync('src/styles/tokens.css', 'utf8')

/**
 * Checks the design tokens against WCAG AA contrast:
 * 4.5:1 for text, 3:1 for the outlines of controls.
 * If a token changes and a pair drops below the line, this test fails.
 */

const lightTheme = tokensCss.slice(0, tokensCss.indexOf("[data-theme='dark']"))

function resolve(name: string, depth = 0): string {
  if (depth > 5) throw new Error(`Token loop at ${name}`)
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(lightTheme)
  if (!match?.[1]) throw new Error(`Token ${name} not found`)
  const value = match[1].trim()
  const reference = /^var\((--[\w-]+)\)$/.exec(value)
  return reference?.[1] ? resolve(reference[1], depth + 1) : value
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [red = 0, green = 0, blue = 0] = channels
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string): number {
  const a = luminance(resolve(foreground))
  const b = luminance(resolve(background))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const TEXT_PAIRS: readonly [foreground: string, background: string][] = [
  // Body text
  ['--tb-ink', '--tb-surface'],
  ['--tb-ink', '--tb-surface-raised'],
  ['--tb-ink', '--tb-surface-sunken'],
  ['--tb-ink-muted', '--tb-surface'],
  ['--tb-ink-muted', '--tb-surface-raised'],
  ['--tb-ink-muted', '--tb-surface-sunken'],
  ['--tb-ink-subtle', '--tb-surface'],
  ['--tb-ink-subtle', '--tb-surface-raised'],
  // Primary buttons and links
  ['--tb-on-primary', '--tb-primary'],
  ['--tb-on-primary', '--tb-primary-hover'],
  ['--tb-on-primary', '--tb-primary-pressed'],
  ['--tb-primary', '--tb-surface'],
  ['--tb-primary', '--tb-surface-raised'],
  ['--tb-primary', '--tb-primary-soft'],
  ['--tb-primary-pressed', '--color-teal-100'],
  // Status chips and messages
  ['--tb-success', '--tb-success-soft'],
  ['--tb-success', '--tb-surface-raised'],
  ['--tb-warning', '--tb-warning-soft'],
  ['--tb-warning', '--tb-surface-raised'],
  ['--tb-error-strong', '--tb-error-soft'],
  ['--tb-error-strong', '--tb-surface-raised'],
  ['--tb-error-strong', '--tb-surface'],
  ['--tb-info', '--tb-info-soft'],
  ['--tb-info', '--tb-surface-raised'],
  // Danger button, offline banner, cart count badge
  ['--color-white', '--tb-error'],
  ['--color-white', '--tb-error-strong'],
  ['--color-white', '--color-grey-900'],
  ['--color-grey-900', '--tb-accent'],
]

const OUTLINE_PAIRS: readonly [foreground: string, background: string][] = [
  ['--tb-line-control', '--tb-surface'],
  ['--tb-line-control', '--tb-surface-raised'],
  ['--tb-focus', '--tb-surface'],
  ['--tb-focus', '--tb-surface-raised'],
  ['--tb-error', '--tb-surface-raised'],
  // The icon of the current page in the navigation, on its pill.
  ['--tb-primary', '--color-teal-100'],
]

describe('design tokens', () => {
  it('keeps the brand colors exactly as specified', () => {
    expect(resolve('--tb-primary').toLowerCase()).toBe('#0e7c7b')
    expect(resolve('--tb-accent').toLowerCase()).toBe('#f5a623')
  })

  it.each(TEXT_PAIRS)('%s on %s meets AA for text (4.5:1)', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(OUTLINE_PAIRS)('%s on %s meets AA for outlines (3:1)', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3)
  })

  it('confirms amber is not safe for small text on white', () => {
    // The reason the accent is for graphics and badges only.
    expect(contrast('--tb-accent', '--color-white')).toBeLessThan(4.5)
  })
})
