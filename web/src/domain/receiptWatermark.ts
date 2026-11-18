/**
 * The faint mark behind every receipt. By default it is the Tallybox mark with
 * the word Tallybox; an owner can use their own text and/or their logo
 * instead, or have none. The small "Powered by Tallybox" line is separate and
 * always printed.
 */

export type WatermarkKind = 'tallybox' | 'custom' | 'none'

export const WATERMARK_KINDS: readonly WatermarkKind[] = ['tallybox', 'custom', 'none']

/** Long enough for a business name, short enough to stay readable across a receipt. */
export const WATERMARK_TEXT_MAX = 40

export interface WatermarkSettings {
  kind: WatermarkKind
  /** The owner's own words. Kept when another kind is chosen, so switching back restores them. */
  text: string | null
  /** Whether the owner's own watermark uses their logo. */
  useLogo: boolean
}

export const DEFAULT_WATERMARK: WatermarkSettings = { kind: 'tallybox', text: null, useLogo: false }

export function isWatermarkKind(value: unknown): value is WatermarkKind {
  return typeof value === 'string' && (WATERMARK_KINDS as readonly string[]).includes(value)
}

/**
 * Tidies what the owner chose: spaces collapsed, empty text dropped. Null when
 * it can't be saved: an unknown kind, text that is too long, or an own
 * watermark with neither text nor logo.
 */
export function cleanWatermark(input: {
  kind: string
  text: string
  useLogo: boolean
}): WatermarkSettings | null {
  if (!isWatermarkKind(input.kind)) return null
  const text = input.text.replace(/\s+/g, ' ').trim()
  if (text.length > WATERMARK_TEXT_MAX) return null
  if (input.kind === 'custom' && !text && !input.useLogo) return null
  return { kind: input.kind, text: text || null, useLogo: input.useLogo }
}

/** What a receipt actually shows behind its content. */
export type ReceiptWatermark =
  | { kind: 'tallybox'; text: 'Tallybox' }
  | { kind: 'custom'; text: string | null; logoUrl: string | null }

/**
 * Null when nothing is shown: the owner chose none, or their own watermark
 * only uses a logo they have since removed.
 */
export function receiptWatermark(
  settings: WatermarkSettings,
  logoUrl: string | null,
): ReceiptWatermark | null {
  if (settings.kind === 'tallybox') return { kind: 'tallybox', text: 'Tallybox' }
  if (settings.kind === 'none') return null
  const logo = settings.useLogo ? logoUrl : null
  if (!settings.text && !logo) return null
  return { kind: 'custom', text: settings.text, logoUrl: logo }
}
