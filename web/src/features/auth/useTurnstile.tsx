import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { env } from '@/lib/env'

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
 */
export function useTurnstile(): TurnstileControl {
  const widget = useRef<TurnstileInstance | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const siteKey = env.turnstileSiteKey

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
      options={{ theme: 'light', size: 'flexible' }}
    />
  ) : null

  return { enabled: Boolean(siteKey), token, element, reset }
}
