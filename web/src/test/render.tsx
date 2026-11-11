import { render, type RenderResult } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Providers } from '@/app/Providers'
import { routes } from '@/app/routes'
import type { Role, SessionState } from '@/features/auth/session'

const TEST_USER_NAME: Record<Role, string> = {
  staff: 'Test Staff',
  owner: 'Test Owner',
  super_admin: 'Test Admin',
}

export function signedInAs(role: Role): SessionState {
  return {
    status: 'signed_in',
    user: {
      id: `test-${role}`,
      role,
      businessId: role === 'super_admin' ? null : 'test-business',
      businessName: role === 'super_admin' ? null : 'Test Shop',
      displayName: TEST_USER_NAME[role],
    },
  }
}

interface RenderAppOptions {
  path?: string
  session?: SessionState
}

/** Renders the real app (real routes, real guards) at a URL, as a given session. */
export function renderApp({
  path = '/',
  session = { status: 'signed_out' },
}: RenderAppOptions = {}): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = render(
    <Providers initialSession={session}>
      <RouterProvider router={router} />
    </Providers>,
  )
  return { ...result, router }
}
