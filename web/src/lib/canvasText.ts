/**
 * Small helpers for drawing documents (receipts, report summaries) on a canvas.
 * A document is laid out twice with the same code: once to measure its height,
 * once to draw it on a canvas of exactly that height.
 */

export const DOCUMENT_FONT = `'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

export const INK = '#16181d'
export const MUTED = '#5b616e'
export const RULE = '#c9cdd4'
export const VOID_RED = '#c62828'

export function font(size: number, weight: 400 | 500 | 600 | 700 = 400): string {
  return `${weight} ${size}px ${DOCUMENT_FONT}`
}

/** Waits for the app font, so the first document doesn't come out in a fallback font. */
export async function fontsReady(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(font(16, 400)),
      document.fonts.load(font(16, 600)),
      document.fonts.load(font(16, 700)),
    ])
  } catch {
    // A fallback font still makes a readable document.
  }
}

/** Splits text into lines that fit a width, breaking long words if they must. */
export function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      // A single word wider than the line is broken by characters.
      let rest = word
      while (context.measureText(rest).width > maxWidth && rest.length > 1) {
        let cut = rest.length - 1
        while (cut > 1 && context.measureText(rest.slice(0, cut)).width > maxWidth) cut -= 1
        lines.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

export function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    // A logo from Storage is on another address. Asking for it with CORS keeps
    // the canvas exportable (otherwise the receipt picture can't be saved).
    if (!source.startsWith('data:')) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

/**
 * Lays out a document at `width` CSS pixels and draws it `scale` times larger
 * for a sharp image. `paint` returns the height it used; when `draw` is false it
 * only measures.
 */
export function renderDocument(
  width: number,
  scale: number,
  paint: (context: CanvasRenderingContext2D, draw: boolean) => number,
  minHeight = 0,
): HTMLCanvasElement {
  const measuring = document.createElement('canvas').getContext('2d')
  if (!measuring) throw new Error('Canvas is not available')
  const height = Math.max(minHeight, Math.ceil(paint(measuring, false)))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')
  context.scale(scale, scale)
  // White, never transparent: JPEG has no transparency and receipts are paper-like.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.textBaseline = 'top'
  measuring.textBaseline = 'top'
  paint(context, true)
  return canvas
}

export function rule(
  context: CanvasRenderingContext2D,
  draw: boolean,
  x: number,
  y: number,
  width: number,
) {
  if (!draw) return
  context.save()
  context.strokeStyle = RULE
  context.lineWidth = 1
  context.setLineDash([4, 3])
  context.beginPath()
  context.moveTo(x, y + 0.5)
  context.lineTo(x + width, y + 0.5)
  context.stroke()
  context.restore()
}
