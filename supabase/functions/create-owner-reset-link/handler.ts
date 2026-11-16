// The super-admin makes a one-time link that lets a business owner choose a new
// password. v1 depends on no email: nothing is sent, and the super-admin passes
// the link on by hand (for example on WhatsApp) after checking who is asking.
//
// The link is as sensitive as a password: it is returned once and never logged.

import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import { HttpError } from '../_shared/http.ts'
import * as fields from '../_shared/schemas.ts'

const schema = z.object({ businessId: fields.uuid })

/** How long Supabase keeps a recovery link valid. Must match the project's "Email OTP expiration". */
const DEFAULT_LINK_SECONDS = 3600

export const handler = defineFunction({
  name: 'create-owner-reset-link',
  auth: 'user',
  schema,
  async run(context) {
    const actorId = context.actor!.id
    // Much stricter than other admin actions: each link is a way into an account.
    await context.limit('admin:reset-link', actorId, 20, 3600)

    // The database checks live that the caller is the super-admin, and answers
    // "not found" otherwise.
    const ownerEmail = await context.rpc<string>('admin_owner_email', {
      p_actor_id: actorId,
      p_business_id: context.body.businessId,
    })

    const { link } = await context.admin.generateRecoveryLink(
      ownerEmail,
      `${context.appOrigin}/reset-password`,
    )
    if (!link) throw new HttpError('server')

    const seconds = Number(context.deps.env('RESET_LINK_SECONDS')) || DEFAULT_LINK_SECONDS
    return {
      url: link,
      ownerEmail,
      expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    }
  },
})
