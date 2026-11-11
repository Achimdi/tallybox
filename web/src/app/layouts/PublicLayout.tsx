import { Outlet } from 'react-router'
import { APP_VERSION } from '@/lib/version'
import { PageTransition } from './PageTransition'

/** Welcome, login and registration: one centered column. */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <footer className="px-4 py-4 pb-safe text-center text-caption text-ink-muted tabular-nums">
        Tallybox v{APP_VERSION}
      </footer>
    </div>
  )
}
