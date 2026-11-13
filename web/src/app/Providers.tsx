import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createApi } from '@/api'
import { ApiContext } from '@/api/context'
import type { TallyboxApi } from '@/api/types'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/ToastProvider'
import type { BlockedNotice, SessionState } from '@/features/auth/session'
import { SessionProvider } from '@/features/auth/SessionProvider'
import { createQueryClient } from './queryClient'

interface ProvidersProps {
  children: ReactNode
  /** For tests: a data layer of your own (usually an in-memory mock). */
  api?: TallyboxApi
  /** For tests: start signed in or signed out, without asking the data layer. */
  initialSession?: SessionState
  /** For tests: start with a "suspended" or "turned off" notice. */
  initialBlocked?: BlockedNotice
}

/** Everything the screens rely on: crash safety, the data layer, the session and toasts. */
export function Providers({ children, api, initialSession, initialBlocked }: ProvidersProps) {
  const [queryClient] = useState(createQueryClient)
  const [dataLayer] = useState<TallyboxApi>(() => api ?? createApi())
  return (
    <ErrorBoundary>
      <ApiContext value={dataLayer}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider
            {...(initialSession ? { initial: initialSession } : {})}
            {...(initialBlocked ? { initialBlocked } : {})}
          >
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </ApiContext>
    </ErrorBoundary>
  )
}
