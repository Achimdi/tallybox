import { describe, expect, it } from 'vitest'
import { imagesToPdf } from './imagePdf'

const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])

function text(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

describe('image PDF', () => {
  it('writes a valid PDF whose cross-reference table points at every object', () => {
    const pdf = imagesToPdf(
      [
        { jpeg: fakeJpeg, pixelWidth: 10, pixelHeight: 20, pageWidth: 100, pageHeight: 200 },
        { jpeg: fakeJpeg, pixelWidth: 10, pixelHeight: 20, pageWidth: 595.28, pageHeight: 841.89 },
      ],
      'Receipt #0048 (Sunrise) ₦',
    )
    const body = text(pdf)
    expect(body.startsWith('%PDF-1.4\n')).toBe(true)
    expect(body.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(body).toContain('/Count 2')
    expect(body).toContain('/MediaBox [0 0 595.28 841.89]')
    // Brackets in the title are escaped; a non-ASCII symbol is replaced.
    expect(body).toContain('/Title (Receipt #0048 \\(Sunrise\\) ?)')

    const startxref = Number(/startxref\n(\d+)/.exec(body)?.[1])
    expect(body.slice(startxref, startxref + 4)).toBe('xref')
    const entries = [...body.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
      Number(match[1]),
    )
    expect(entries).toHaveLength(9)
    entries.forEach((offset, index) => {
      expect(body.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true)
    })
  })

  it('keeps the picture bytes exactly, with the right length', () => {
    const pdf = imagesToPdf(
      [{ jpeg: fakeJpeg, pixelWidth: 1, pixelHeight: 1, pageWidth: 10, pageHeight: 10 }],
      'x',
    )
    const body = text(pdf)
    expect(body).toContain(`/Length ${fakeJpeg.length} >>\nstream\n`)
    const start = body.indexOf('stream\nÿØ') + 'stream\n'.length
    expect([...pdf.slice(start, start + fakeJpeg.length)]).toEqual([...fakeJpeg])
  })

  it('refuses an empty document', () => {
    expect(() => imagesToPdf([], 'x')).toThrow()
  })
})
