import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/ToastProvider'
import type { BlockedNotice, SessionState } from '@/features/auth/session'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { createQueryClient } from './queryClient'

interface ProvidersProps {
  children: ReactNode
  /** For tests: start signed in or signed out. */
  initialSession?: SessionState
  /** For tests: start with a "suspended" or "turned off" notice. */
  initialBlocked?: BlockedNotice
}

/** Everything the screens rely on: crash safety, server data, the session and toasts. */
export function Providers({ children, initialSession, initialBlocked }: ProvidersProps) {
  const [queryClient] = useState(createQueryClient)
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionProvider
          {...(initialSession ? { initial: initialSession } : {})}
          {...(initialBlocked ? { initialBlocked } : {})}
        >
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
