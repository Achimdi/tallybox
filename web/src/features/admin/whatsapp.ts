import { formatDate } from '@/lib/dates'

interface ShareableCode {
  code: string
  ownerEmail: string
  expiresAt: string
}

/** The message that goes to a new client: the app link, their email and the code. */
export function activationMessage(
  code: ShareableCode,
  registerUrl: string,
  timeZone: string,
): string {
  return [
    'Welcome to Tallybox!',
    '',
    `1. Open ${registerUrl}`,
    `2. Register with this email: ${code.ownerEmail}`,
    `3. Enter this activation code: ${code.code}`,
    '',
    `The code works once and expires on ${formatDate(new Date(code.expiresAt), timeZone)}.`,
  ].join('\n')
}

/** A link that opens WhatsApp with the message ready, so you only choose the contact. */
export function whatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
