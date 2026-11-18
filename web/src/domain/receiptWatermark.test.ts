import { describe, expect, it } from 'vitest'
import {
  cleanWatermark,
  DEFAULT_WATERMARK,
  receiptWatermark,
  WATERMARK_TEXT_MAX,
} from './receiptWatermark'

describe('cleanWatermark', () => {
  it('accepts each kind and tidies the text', () => {
    expect(cleanWatermark({ kind: 'tallybox', text: '', useLogo: false })).toEqual(
      DEFAULT_WATERMARK,
    )
    expect(cleanWatermark({ kind: 'none', text: '  ', useLogo: true })).toEqual({
      kind: 'none',
      text: null,
      useLogo: true,
    })
    expect(
      cleanWatermark({ kind: 'custom', text: '  Sunrise   Pharmacy ', useLogo: false }),
    ).toEqual({ kind: 'custom', text: 'Sunrise Pharmacy', useLogo: false })
    expect(cleanWatermark({ kind: 'custom', text: '', useLogo: true })).toEqual({
      kind: 'custom',
      text: null,
      useLogo: true,
    })
  })

  it('refuses an unknown kind, long text, and an own watermark with nothing in it', () => {
    expect(cleanWatermark({ kind: 'sparkles', text: '', useLogo: false })).toBeNull()
    expect(
      cleanWatermark({ kind: 'custom', text: 'x'.repeat(WATERMARK_TEXT_MAX + 1), useLogo: false }),
    ).toBeNull()
    expect(
      cleanWatermark({ kind: 'custom', text: 'x'.repeat(WATERMARK_TEXT_MAX), useLogo: false }),
    ).not.toBeNull()
    expect(cleanWatermark({ kind: 'custom', text: '   ', useLogo: false })).toBeNull()
    // Long text is refused even when it isn't in use, so it never gets saved.
    expect(
      cleanWatermark({
        kind: 'tallybox',
        text: 'x'.repeat(WATERMARK_TEXT_MAX + 1),
        useLogo: false,
      }),
    ).toBeNull()
  })
})

describe('receiptWatermark', () => {
  const logo = 'data:image/png;base64,AAAA'

  it('shows the Tallybox mark by default, and nothing when the owner chose none', () => {
    expect(receiptWatermark(DEFAULT_WATERMARK, logo)).toEqual({
      kind: 'tallybox',
      text: 'Tallybox',
    })
    expect(receiptWatermark({ kind: 'none', text: 'Sunrise', useLogo: true }, logo)).toBeNull()
  })

  it("shows the owner's text and logo, only as chosen", () => {
    expect(receiptWatermark({ kind: 'custom', text: 'Sunrise', useLogo: true }, logo)).toEqual({
      kind: 'custom',
      text: 'Sunrise',
      logoUrl: logo,
    })
    expect(receiptWatermark({ kind: 'custom', text: 'Sunrise', useLogo: false }, logo)).toEqual({
      kind: 'custom',
      text: 'Sunrise',
      logoUrl: null,
    })
    expect(receiptWatermark({ kind: 'custom', text: null, useLogo: true }, logo)).toEqual({
      kind: 'custom',
      text: null,
      logoUrl: logo,
    })
  })

  it('shows nothing when an own watermark only used a logo that has been removed', () => {
    expect(receiptWatermark({ kind: 'custom', text: null, useLogo: true }, null)).toBeNull()
  })
})
