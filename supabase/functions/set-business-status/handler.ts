// The super-admin suspends or reactivates a business.
// Suspending takes effect on the very next query, and signs the business's users out.

import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import { LIMITS } from '../_shared/rules.ts'
import * as fields from '../_shared/schemas.ts'

const schema = z
  .object({
    businessId: fields.uuid,
    status: z.enum(['active', 'suspended']),
    reason: fields.optionalText(LIMITS.reasonMax),
  })
  // A suspension always records why.
  .refine((body) => body.status === 'active' || body.reason !== null, { path: ['reason'] })

export const handler = defineFunction({
  name: 'set-business-status',
  auth: 'user',
  schema,
  async run(context) {
    const actorId = context.actor!.id
    await context.limit('admin:user', actorId, 120, 3600)

    await context.rpc('admin_set_business_status', {
      p_actor_id: actorId,
      p_business_id: context.body.businessId,
      p_status: context.body.status,
      p_reason: context.body.reason,
    })
    return { status: context.body.status }
  },
})
