// The super-admin extends a business's access period.
// Days are added from the later of now and the current end date. Null days
// makes access open-ended. The business works again on its very next request.

import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import * as fields from '../_shared/schemas.ts'

const schema = z.object({
  businessId: fields.uuid,
  days: fields.accessDays,
})

export const handler = defineFunction({
  name: 'extend-business-access',
  auth: 'user',
  schema,
  async run(context) {
    const actorId = context.actor!.id
    await context.limit('admin:user', actorId, 120, 3600)

    // The database checks live that the caller is the super-admin.
    const accessEndsAt = await context.rpc<string | null>('admin_extend_access', {
      p_actor_id: actorId,
      p_business_id: context.body.businessId,
      p_days: context.body.days,
    })
    return { accessEndsAt }
  },
})
