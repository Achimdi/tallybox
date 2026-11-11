// An owner creates a staff account: a username and a temporary password.

import { createAuthUser, withCompensation } from '../_shared/accounts.ts'
import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import { DEFAULT_STAFF_EMAIL_DOMAIN, staffEmail } from '../_shared/rules.ts'
import * as fields from '../_shared/schemas.ts'

const schema = z.object({
  displayName: fields.displayName,
  username: fields.username,
  password: fields.password,
})

interface Precheck {
  business_id: string
  business_code: string
  username: string
}

export const handler = defineFunction({
  name: 'create-staff',
  auth: 'user',
  schema,
  async run(context) {
    const { body } = context
    const ownerId = context.actor!.id

    await context.limit('create-staff:user', ownerId, 30, 3600)

    // The database decides, live, whether the caller is an active owner of a
    // business with access. The token's claims are not trusted for this.
    const precheck = await context.rpc<Precheck>('staff_precheck', {
      p_owner_id: ownerId,
      p_username: body.username,
    })

    const domain = context.deps.env('STAFF_EMAIL_DOMAIN') || DEFAULT_STAFF_EMAIL_DOMAIN
    const staffId = await createAuthUser(context, {
      email: staffEmail(precheck.username, precheck.business_code, domain),
      password: body.password,
      role: 'staff',
      businessId: precheck.business_id,
      duplicateCode: 'username_taken',
    })

    await withCompensation(context, staffId, () =>
      context.rpc('create_staff_profile', {
        p_owner_id: ownerId,
        p_staff_user_id: staffId,
        p_username: precheck.username,
        p_display_name: body.displayName,
      }),
    )

    return { id: staffId, username: precheck.username, displayName: body.displayName }
  },
})
