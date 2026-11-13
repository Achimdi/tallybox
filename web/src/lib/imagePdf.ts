/**
 * A tiny PDF writer: each page shows one JPEG picture, scaled to fill the page.
 *
 * Receipts and report summaries are drawn once on a canvas (so every currency
 * symbol and font renders exactly as on screen) and saved as PNG or wrapped in a
 * PDF with this. A full PDF library would add 100 KB+ for the same result.
 * The format follows the PDF 1.4 reference: a catalog, a page tree, and per page
 * a page object, a content stream and an image XObject (DCTDecode = JPEG).
 */

export interface PdfImagePage {
  /** The JPEG file's bytes. */
  jpeg: Uint8Array
  /** The picture's size in pixels. */
  pixelWidth: number
  pixelHeight: number
  /** The page's size in points (1/72 inch). The picture fills it. */
  pageWidth: number
  pageHeight: number
}

/** Page sizes in points. */
export const PAGE = {
  a4: { width: 595.28, height: 841.89 },
  /** Width of 80 mm receipt paper. */
  receipt80: { width: 226.77 },
} as const

const encoder = new TextEncoder()

function ascii(text: string): string {
  // Only ASCII ever goes into the structure; anything else is replaced.
  return text.replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, (char) => `\\${char}`)
}

const round = (value: number) => Number(value.toFixed(2))

export function imagesToPdf(
  pages: readonly PdfImagePage[],
  title: string,
): Uint8Array<ArrayBuffer> {
  if (pages.length === 0) throw new Error('A PDF needs at least one page')
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (id: number, body: string) => {
    offsets[id] = length
    push(`${id} 0 obj\n${body}\nendobj\n`)
  }

  // Objects: 1 catalog, 2 page tree, 3 info, then 3 per page (page, contents, image).
  const pageId = (index: number) => 4 + index * 3
  push('%PDF-1.4\n')
  // A comment with high bytes tells tools the file is binary.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(
    2,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  )
  object(3, `<< /Title (${ascii(title)}) /Producer (Tallybox) >>`)

  pages.forEach((page, index) => {
    const id = pageId(index)
    const width = round(page.pageWidth)
    const height = round(page.pageHeight)
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im${index} ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
    )
    const draw = `q ${width} 0 0 ${height} 0 0 cm /Im${index} Do Q`
    object(id + 1, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)

    offsets[id + 2] = length
    push(
      `${id + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    )
    push(page.jpeg)
    push('\nendstream\nendobj\n')
  })

  const count = 4 + pages.length * 3
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id += 1) {
    push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const result = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    result.set(chunk, at)
    at += chunk.length
  }
  return result
}

/** A canvas as JPEG bytes (no transparency: draw on white first). */
export async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('The picture could not be made')
  return new Uint8Array(await blob.arrayBuffer())
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The picture could not be made')
  return blob
}
