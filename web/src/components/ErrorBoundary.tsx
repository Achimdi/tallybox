import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '@/lib/logger'
import { Button } from './Button'
import { ErrorState } from './states'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * The last line of defence: if any screen crashes while drawing, show a calm
 * message instead of a blank page. The raw error is logged (without personal
 * data) and never shown.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('render_crash', error, {
      // Component names only: where it broke, not what the person typed.
      stack: info.componentStack?.split('\n').slice(0, 4).join(' ').trim() ?? '',
    })
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center">
        <ErrorState
          headingLevel={1}
          title="Something went wrong"
          description="Reload the app to carry on. Confirmed orders are already saved."
        />
        <Button onClick={() => window.location.reload()}>Reload Tallybox</Button>
      </main>
    )
  }
}
