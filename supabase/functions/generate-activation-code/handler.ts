// The super-admin creates a single-use activation code for one owner email.
// The code is returned once, here, and only its hash is kept. It carries the
// access length the business gets when it registers (null means open-ended).

import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import { HttpError } from '../_shared/http.ts'
import { LIMITS } from '../_shared/rules.ts'
import * as fields from '../_shared/schemas.ts'

const schema = z.object({
  ownerEmail: fields.email,
  note: fields.optionalText(LIMITS.noteMax),
  expiresInDays: z
    .number()
    .int()
    .min(LIMITS.activationCodeDaysMin)
    .max(LIMITS.activationCodeDaysMax)
    .default(7),
  accessDays: fields.accessDays.default(LIMITS.accessDaysDefault),
})

interface GeneratedCode {
  id: string
  code: string
  owner_email: string
  expires_at: string
  access_days: number | null
}

export const handler = defineFunction({
  name: 'generate-activation-code',
  auth: 'user',
  schema,
  async run(context) {
    const actorId = context.actor!.id
    await context.limit('admin:user', actorId, 120, 3600)

    // The database checks live that the caller is the super-admin, and answers
    // "not found" otherwise, the same as for an address that does not exist.
    const rows = await context.rpc<GeneratedCode[]>('admin_generate_activation_code', {
      p_actor_id: actorId,
      p_owner_email: context.body.ownerEmail,
      p_note: context.body.note,
      p_expires_in_days: context.body.expiresInDays,
      p_access_days: context.body.accessDays,
    })
    const row = rows[0]
    if (!row) throw new HttpError('server')

    return {
      id: row.id,
      code: row.code,
      ownerEmail: row.owner_email,
      expiresAt: row.expires_at,
      accessDays: row.access_days,
    }
  },
})
