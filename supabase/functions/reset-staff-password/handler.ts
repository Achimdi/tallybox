// An owner gives a staff member who forgot their password a new one.
//
// Only the secret key can set someone else's password, so this runs here. The
// database decides, live, that the caller is an active owner and that the
// staff member is theirs. The password is never logged or returned.

import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import { HttpError } from '../_shared/http.ts'
import { PASSWORD_MAX, PASSWORD_MIN } from '../_shared/rules.ts'
import * as fields from '../_shared/schemas.ts'

const schema = z.object({
  staffId: fields.uuid,
  // Checked below, so a short one is "weak_password" rather than "validation".
  newPassword: z.string().max(1000),
})

export const handler = defineFunction({
  name: 'reset-staff-password',
  auth: 'user',
  schema,
  async run(context) {
    const ownerId = context.actor!.id
    const { staffId, newPassword } = context.body

    await context.limit('reset-staff-password:user', ownerId, 30, 3600)
    await context.rpc('staff_reset_precheck', { p_owner_id: ownerId, p_staff_id: staffId })

    if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
      throw new HttpError('weak_password')
    }
    const { errorCode } = await context.admin.updateUserPassword(staffId, newPassword)
    if (errorCode === 'weak_password') throw new HttpError('weak_password')
    if (errorCode === 'user_not_found') throw new HttpError('not_found')
    if (errorCode) throw new HttpError('server')

    return { ok: true }
  },
})
