import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useApi } from '@/api/context'
import { env } from '@/lib/env'

/**
 * Turnstile's "flexible" box fills the form but is never narrower than 300 px,
 * which is too wide on a small phone, or on any phone with large text or
 * display size turned on (the page then acts narrower). Those screens get the
 * 150 px "compact" box instead. The form has 16 px of space on each side.
 */
const NARROW_SCREEN = '(max-width: 339px)'

function widgetSize(): 'flexible' | 'compact' {
  return typeof window !== 'undefined' && window.matchMedia?.(NARROW_SCREEN).matches
    ? 'compact'
    : 'flexible'
}

interface TurnstileControl {
  /** False when no site key is configured: there is no check and no token. */
  enabled: boolean
  /** The proof to send with the form, once the check has passed. Single use. */
  token: string | null
  /** Put this in the form, above the submit button. */
  element: ReactNode
  /** Call after a failed submit: the old token is spent, so get a new one. */
  reset: () => void
}

/**
 * Cloudflare Turnstile: a free "are you a person?" check for the login and
 * registration forms. The token it produces is verified on the server (by
 * Supabase Auth for sign-in, and by the Edge Function for registration).
 * The demo data layer has no server to check it, so the widget is off there.
 */
export function useTurnstile(): TurnstileControl {
  const widget = useRef<TurnstileInstance | null>(null)
  const [token, setToken] = useState<string | null>(null)
  // Chosen once, when the form opens: changing it would restart the check.
  const [size] = useState(widgetSize)
  const api = useApi()
  const siteKey = api.requiresCaptcha ? env.turnstileSiteKey : undefined

  const reset = useCallback(() => {
    setToken(null)
    widget.current?.reset()
  }, [])

  const clear = useCallback(() => setToken(null), [])

  const element = siteKey ? (
    <Turnstile
      ref={widget}
      siteKey={siteKey}
      onSuccess={setToken}
      onExpire={clear}
      onError={clear}
      options={{ theme: 'light', size }}
    />
  ) : null

  return { enabled: Boolean(siteKey), token, element, reset }
}
