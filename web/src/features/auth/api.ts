import { z } from 'zod'
import { callFunction } from '@/lib/api'

export interface RegistrationInput {
  businessName: string
  businessCode: string
  ownerName: string
  email: string
  password: string
  phone: string
  activationCode: string
  turnstileToken: string
}

/** Creates the business and its owner account. Throws an AppError when refused. */
export async function registerBusiness(
  input: RegistrationInput,
): Promise<{ businessCode: string }> {
  return callFunction(
    'register-business',
    {
      ...input,
      // A sensible first setting. The owner can change it in settings later.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    z.object({ businessCode: z.string() }),
  )
}

/** True if nobody has taken this business code yet. */
export async function isBusinessCodeAvailable(businessCode: string): Promise<boolean> {
  const result = await callFunction(
    'check-business-code',
    { businessCode },
    z.object({ available: z.boolean() }),
  )
  return result.available
}
