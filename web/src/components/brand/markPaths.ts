/**
 * The Tallybox symbol's strokes, on a 512 × 512 tile: an open box, four tally
 * marks and the strike. Shared by the logo, the receipt picture and the
 * printed receipt so they always match.
 */
export const MARK_PATHS = {
  box: { d: 'M132 212v156a24 24 0 0 0 24 24h200a24 24 0 0 0 24-24V212', width: 28 },
  tallies: { d: 'M196 164v160M236 164v160M276 164v160M316 164v160', width: 22 },
  strike: { d: 'M160 300 352 188', width: 24 },
} as const

/** The area the strokes cover (stroke width included), for drawing the mark without its tile. */
export const MARK_BOUNDS = { x: 118, y: 150, width: 276, height: 256 } as const
