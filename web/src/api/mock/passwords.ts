/**
 * Demo passwords are stored only as a salted SHA-256 hash. Someone trying the
 * demo might type a password they use elsewhere, so it is never kept as text.
 * (The real backend in Phase 2 uses Supabase Auth instead.)
 */

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${password}`),
  )
  return toHex(digest)
}

export async function passwordMatches(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  return (await hashPassword(password, salt)) === expectedHash
}
