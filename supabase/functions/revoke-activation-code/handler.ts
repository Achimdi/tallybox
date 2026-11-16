// The super-admin revokes an activation code that has not been used yet.

import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import * as fields from '../_shared/schemas.ts'

const schema = z.object({ codeId: fields.uuid })

export const handler = defineFunction({
  name: 'revoke-activation-code',
  auth: 'user',
  schema,
  async run(context) {
    const actorId = context.actor!.id
    await context.limit('admin:user', actorId, 120, 3600)

    await context.rpc('admin_revoke_activation_code', {
      p_actor_id: actorId,
      p_code_id: context.body.codeId,
    })
    return { revoked: true }
  },
})
