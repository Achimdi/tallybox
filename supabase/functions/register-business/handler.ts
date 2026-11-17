// Registers a new business and its owner. Public: protected by Turnstile,
// rate limits and the single-use activation code.

import { createAuthUser, withCompensation } from '../_shared/accounts.ts'
import { z } from '../_shared/deps.ts'
import { defineFunction, verifyTurnstile } from '../_shared/handler.ts'
import { HttpError, isErrorCode } from '../_shared/http.ts'
import { LIMITS } from '../_shared/rules.ts'
import * as fields from '../_shared/schemas.ts'

const schema = z.object({
  businessName: fields.businessName,
  businessCode: fields.businessCode,
  ownerName: fields.displayName,
  email: fields.email,
  password: fields.password,
  phone: fields.optionalText(LIMITS.phoneMax),
  activationCode: fields.activationCode,
  /** The browser's own timezone, as a sensible first setting. */
  timezone: z.string().max(64).nullish(),
  turnstileToken: fields.turnstileToken,
})

const HOUR = 3600

export const handler = defineFunction({
  name: 'register-business',
  auth: 'none',
  schema,
  async run(context) {
    const { body } = context

    // Wrong guesses are limited per IP, per email and per device. The per-IP
    // limit can be raised with REGISTER_IP_LIMIT (for example on a dev project
    // that runs automated tests); it never goes below the default of 10.
    const ipLimit = Math.max(10, Number(context.deps.env('REGISTER_IP_LIMIT')) || 10)
    await context.limit('register:ip', context.ip, ipLimit, HOUR)
    await context.limit('register:email', body.email, 5, HOUR)
    if (context.deviceId) await context.limit('register:device', context.deviceId, 5, HOUR)

    await verifyTurnstile(context.deps, body.turnstileToken, context.ip)

    // Check the code and the business code BEFORE creating anything.
    const problem = await context.rpc<string>('validate_activation_code', {
      p_code: body.activationCode,
      p_email: body.email,
    })
    if (problem !== 'ok') {
      throw new HttpError(isErrorCode(problem) ? problem : 'activation_code_invalid')
    }

    const available = await context.rpc<boolean>('business_code_available', {
      p_code: body.businessCode,
    })
    if (!available) throw new HttpError('business_code_taken')

    const businessId = crypto.randomUUID()
    const ownerId = await createAuthUser(context, {
      email: body.email,
      password: body.password,
      role: 'owner',
      businessId,
      duplicateCode: 'email_taken',
    })

    // One database transaction: business, owner profile, code marked used.
    await withCompensation(context, ownerId, () =>
      context.rpc('register_business', {
        p_business_id: businessId,
        p_owner_id: ownerId,
        p_owner_email: body.email,
        p_owner_name: body.ownerName,
        p_business_name: body.businessName,
        p_business_code: body.businessCode,
        p_phone: body.phone,
        p_timezone: body.timezone ?? null,
        p_activation_code: body.activationCode,
      }),
    )

    return { businessCode: body.businessCode }
  },
})
