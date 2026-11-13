import type { GeneratedCode } from '@/api/types'
import { formatDate } from '@/lib/dates'
import { accessLengthLabel } from './access'

/** The message that goes to a new client: the app link, their email, the code and its window. */
export function activationMessage(
  code: Pick<GeneratedCode, 'code' | 'ownerEmail' | 'redeemBy' | 'accessDays'>,
  registerUrl: string,
  timeZone: string,
): string {
  const access =
    code.accessDays === null
      ? 'Your access has no end date.'
      : `Your access lasts ${accessLengthLabel(code.accessDays)} from the day you register.`
  return [
    'Welcome to Tallybox!',
    '',
    `1. Open ${registerUrl}`,
    `2. Register with this email: ${code.ownerEmail}`,
    `3. Enter this activation code: ${code.code}`,
    '',
    `The code works once, until ${formatDate(new Date(code.redeemBy), timeZone)}. ${access}`,
  ].join('\n')
}

/** A link that opens WhatsApp with the message ready, so you only choose the contact. */
export function whatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
