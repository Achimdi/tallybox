// Checks a logo sent by the app: a small picture as a data URL.
//
// The app shrinks a chosen picture before sending it, so anything large or
// odd is refused. The declared type is not trusted: the file's own first bytes
// must say the same thing.

import { HttpError } from './http.ts'

/** The longest data URL accepted, the same limit the app uses (web/src/features/settings/logo.ts). */
export const LOGO_MAX_LENGTH = 300_000

export interface Logo {
  bytes: Uint8Array
  contentType: 'image/png' | 'image/jpeg' | 'image/webp'
  extension: 'png' | 'jpg' | 'webp'
}

const TYPES = {
  png: { contentType: 'image/png', extension: 'png' },
  jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
  webp: { contentType: 'image/webp', extension: 'webp' },
} as const

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
  signature.every((byte, index) => bytes[at + index] === byte)

function looksLike(kind: keyof typeof TYPES, bytes: Uint8Array): boolean {
  switch (kind) {
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case 'webp':
      // "RIFF", four bytes of length, then "WEBP".
      return (
        startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      )
  }
}

/** The picture inside a data URL, or `validation` if it is not a small PNG, JPEG or WebP. */
export function decodeLogo(dataUrl: string): Logo {
  if (dataUrl.length > LOGO_MAX_LENGTH) throw new HttpError('validation', ['logo'])
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw new HttpError('validation', ['logo'])
  const kind = match[1] as keyof typeof TYPES

  let binary: string
  try {
    binary = atob(match[2]!)
  } catch {
    throw new HttpError('validation', ['logo'])
  }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  if (bytes.length < 12 || !looksLike(kind, bytes)) throw new HttpError('validation', ['logo'])
  return { bytes, ...TYPES[kind] }
}
