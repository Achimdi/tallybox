// Tells the registration form whether a business code is free.
// Public and rate limited. It answers only "available" or "not available".

import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import { isValidBusinessCode, normalizeBusinessCode } from '../_shared/rules.ts'

const schema = z.object({
  // Deliberately loose: a badly formed code is simply "not available".
  businessCode: z.string().max(64),
})

export const handler = defineFunction({
  name: 'check-business-code',
  auth: 'none',
  schema,
  async run(context) {
    await context.limit('check-code:ip', context.ip, 60, 600)
    if (context.deviceId) await context.limit('check-code:device', context.deviceId, 60, 600)

    const code = normalizeBusinessCode(context.body.businessCode)
    if (!isValidBusinessCode(code)) return { available: false }

    const available = await context.rpc<boolean>('business_code_available', { p_code: code })
    return { available: available === true }
  },
})
