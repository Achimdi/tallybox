import { QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { ApiContext } from '@/api/context'
import type { TallyboxApi } from '@/api/types'
import { Providers } from '@/app/Providers'
import { createQueryClient } from '@/app/queryClient'
import { routes } from '@/app/routes'
import { ToastProvider } from '@/components/ToastProvider'
import {
  SessionContext,
  type BlockedNotice,
  type Role,
  type SessionContextValue,
  type SessionState,
} from '@/features/auth/session'
import { createTestApi } from './mockApi'

type Router = ReturnType<typeof createMemoryRouter>

const TEST_USER_NAME: Record<Role, string> = {
  staff: 'Test Staff',
  owner: 'Test Owner',
  super_admin: 'Test Admin',
}

/** A session to start from, without asking the data layer (for layout and guard tests). */
export function signedInAs(role: Role): SessionState {
  const inBusiness = role !== 'super_admin'
  return {
    status: 'signed_in',
    user: {
      id: `test-${role}`,
      role,
      displayName: TEST_USER_NAME[role],
      email: role === 'staff' ? null : `${role}@test.test`,
      username: role === 'staff' ? 'teststaff' : null,
      businessId: inBusiness ? 'test-business' : null,
      businessName: inBusiness ? 'Test Shop' : null,
      businessCode: inBusiness ? 'test-shop' : null,
      currencyCode: inBusiness ? 'NGN' : null,
      timezone: inBusiness ? 'Africa/Lagos' : null,
      accessEndsAt: null,
    },
  }
}

interface RenderAppOptions {
  path?: string
  /** The data layer. Default: a fresh in-memory demo, signed out. */
  api?: TallyboxApi
  /** Start from this session without asking the data layer. */
  session?: SessionState
  blocked?: BlockedNotice
  /** React Router location state, as set by `navigate(path, { state })`. */
  state?: unknown
}

/** Renders the real app (real routes, guards and providers) at a URL. */
export function renderApp({
  path = '/',
  api = createTestApi().api,
  session,
  blocked,
  state,
}: RenderAppOptions = {}): RenderResult & { router: Router } {
  const router = createMemoryRouter(routes, {
    initialEntries: [state === undefined ? path : { pathname: path, state }],
  })
  const result = render(
    <Providers
      api={api}
      {...(session ? { initialSession: session } : {})}
      {...(blocked ? { initialBlocked: blocked } : {})}
    >
      <RouterProvider router={router} />
    </Providers>,
  )
  return { ...result, router }
}

interface RenderPageOptions {
  /** Replace parts of the session, for example a `signIn` that fails. */
  session?: Partial<SessionContextValue>
  api?: TallyboxApi
  state?: unknown
}

/**
 * Renders one page on its own, with a session you control. Use it to test what
 * a page does when signing in succeeds or fails in a particular way.
 */
export function renderPage(
  page: ReactElement,
  { session, api = createTestApi().api, state }: RenderPageOptions = {},
): RenderResult & { router: Router } {
  const value: SessionContextValue = {
    session: { status: 'signed_out' },
    blocked: null,
    clearBlocked: () => undefined,
    signIn: () => Promise.resolve(),
    signOut: () => undefined,
    ...session,
  }
  const router = createMemoryRouter([{ path: '*', element: page }], {
    initialEntries: [state === undefined ? '/' : { pathname: '/', state }],
  })
  const result = render(
    <ApiContext value={api}>
      <QueryClientProvider client={createQueryClient()}>
        <SessionContext value={value}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </SessionContext>
      </QueryClientProvider>
    </ApiContext>,
  )
  return { ...result, router }
}
