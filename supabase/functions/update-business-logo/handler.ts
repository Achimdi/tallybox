// An owner sets or removes the business logo printed on receipts.
//
// The browser never writes to Storage itself: the picture comes here, is
// checked (a small PNG, JPEG or WebP whose bytes match its type), and is saved
// under the business's own folder with a new random name. Then the database
// points the business at it, and the old file is removed.

import { z } from '../_shared/deps.ts'
import { defineFunction } from '../_shared/handler.ts'
import { HttpError } from '../_shared/http.ts'
import { decodeLogo, LOGO_MAX_LENGTH } from '../_shared/logo.ts'

export const LOGO_BUCKET = 'logos'

const schema = z.object({
  // A data URL, or null to remove the logo.
  logo: z.string().max(LOGO_MAX_LENGTH).nullable(),
})

export const handler = defineFunction({
  name: 'update-business-logo',
  auth: 'user',
  schema,
  maxBodyBytes: LOGO_MAX_LENGTH + 1_000,
  async run(context) {
    const ownerId = context.actor!.id
    await context.limit('update-business-logo:user', ownerId, 30, 3600)

    // Live check that the caller is an active owner; gives their business.
    const businessId = await context.rpc<string>('owner_precheck', { p_owner_id: ownerId })

    let path: string | null = null
    if (context.body.logo !== null) {
      const logo = decodeLogo(context.body.logo)
      path = `${businessId}/${crypto.randomUUID()}.${logo.extension}`
      const upload = await context.admin.uploadObject(
        LOGO_BUCKET,
        path,
        logo.bytes,
        logo.contentType,
      )
      if (!upload.ok) throw new HttpError('server')
    }

    let previous: string | null
    try {
      previous = await context.rpc<string | null>('set_business_logo', {
        p_owner_id: ownerId,
        p_logo_path: path,
      })
    } catch (error) {
      // Not saved: don't leave the new file behind.
      if (path) await context.admin.removeObjects(LOGO_BUCKET, [path])
      throw error
    }
    if (previous && previous !== path) await context.admin.removeObjects(LOGO_BUCKET, [previous])

    return { logoPath: path }
  },
})
