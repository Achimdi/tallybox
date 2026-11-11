import { QueryClient } from '@tanstack/react-query'
import { toAppError, type AppErrorCode } from '@/lib/errors'

/** Only problems that might fix themselves are worth trying again. */
const RETRYABLE: readonly AppErrorCode[] = ['offline', 'server', 'unknown']

/**
 * TanStack Query holds data read from the server (items, orders, reports).
 * It lives in memory only: nothing is saved on the device, and the service
 * worker never caches API responses.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) =>
          failureCount < 2 && RETRYABLE.includes(toAppError(error).code),
      },
      mutations: {
        // Changes are never retried silently. The person decides, and
        // order confirmation is safe to repeat because it is idempotent.
        retry: false,
      },
    },
  })
}
