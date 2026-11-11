import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { Button } from '@/components/Button'
import { ErrorState } from '@/components/states'
import { logger } from '@/lib/logger'

/** Shown by the router when a screen fails to load or crashes. */
export function RouteErrorPage() {
  const error = useRouteError()

  useEffect(() => {
    logger.error('route_error', error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      <ErrorState
        headingLevel={1}
        title="This screen didn't load"
        description="Check your connection and reload. If a new version was just released, reloading picks it up."
      />
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </main>
  )
}
