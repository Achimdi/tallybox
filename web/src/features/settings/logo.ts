/** The longest data URL the logo may be (the mock and, later, the server check the same). */
export const LOGO_MAX_LENGTH = 300_000
const LOGO_MAX_SIDE = 256

export type LogoProblem = 'not_image' | 'too_large' | 'unreadable'

/**
 * Shrinks a chosen picture to at most 256 px on its longest side and returns it
 * as a small data URL. Done in the browser so a big phone photo never gets sent.
 */
export async function shrinkLogo(
  file: File,
): Promise<{ ok: true; dataUrl: string } | { ok: false; problem: LogoProblem }> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { ok: false, problem: 'not_image' }
  if (file.size > 10 * 1024 * 1024) return { ok: false, problem: 'too_large' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, problem: 'unreadable' }
  }
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return { ok: false, problem: 'unreadable' }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // WebP is smallest; browsers that can't make it fall back to PNG, which is also accepted.
  let dataUrl = canvas.toDataURL('image/webp', 0.85)
  if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/png')
  if (dataUrl.length > LOGO_MAX_LENGTH) return { ok: false, problem: 'too_large' }
  return { ok: true, dataUrl }
}

export const LOGO_PROBLEM_TEXT: Record<LogoProblem, string> = {
  not_image: 'Choose a PNG, JPEG or WebP picture.',
  too_large: 'That picture is too big. Try a simpler or smaller one.',
  unreadable: "That picture couldn't be read. Try another one.",
}
