import { Package, UserPlus } from 'lucide-react'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SectionHeader } from '@/components/SectionHeader'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { useSession } from '@/features/auth/session'
import { useStaffCount } from '@/features/staff/api'

/**
 * The owner's first screen. For now it is the short onboarding: add items,
 * create a staff account. Sales figures join it in Phase 4.
 */
export default function OwnerHomePage() {
  const { session } = useSession()
  const staffCount = useStaffCount()
  const user = session.status === 'signed_in' ? session.user : null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">Dashboard</h1>
        <p className="text-body text-ink-muted">
          Welcome{user ? `, ${user.displayName}` : ''}. Two steps and you&apos;re ready to sell.
        </p>
      </header>

      <section aria-labelledby="setup-title" className="flex flex-col gap-3">
        <SectionHeader title="Get set up" />
        <span id="setup-title" className="sr-only">
          Get set up
        </span>
        {staffCount.isError ? (
          <div className="rounded-card border border-line bg-surface-raised">
            <ErrorState error={staffCount.error} onRetry={() => void staffCount.refetch()} />
          </div>
        ) : (
          <ListGroup>
            <ListItem
              leading={<Package aria-hidden="true" className="size-5" />}
              title="Add your first items"
              subtitle="What you sell, with prices and stock"
              trailing={<StatusChip status="held" label="Coming next" />}
            />
            <ListItem
              to="/owner/staff/new"
              leading={<UserPlus aria-hidden="true" className="size-5" />}
              title="Create a staff account"
              subtitle={
                staffCount.isPending
                  ? 'Checking…'
                  : staffCount.data === 0
                    ? 'So your staff can take orders'
                    : `${staffCount.data} staff ${staffCount.data === 1 ? 'account' : 'accounts'} so far. Add another.`
              }
              trailing={
                staffCount.isPending ? (
                  <Skeleton className="h-6 w-14 rounded-full" />
                ) : staffCount.data && staffCount.data > 0 ? (
                  <StatusChip status="completed" label="Done" />
                ) : undefined
              }
            />
          </ListGroup>
        )}
      </section>

      {user?.businessCode ? (
        <section aria-labelledby="code-title" className="flex flex-col gap-3">
          <SectionHeader title="Your business code" />
          <div className="flex flex-col gap-1 rounded-card border border-line bg-surface-raised p-4 shadow-soft">
            <p id="code-title" className="text-title-lg text-ink">
              {user.businessCode}
            </p>
            <p className="text-label font-normal text-ink-muted">
              Staff type this, with their username and password, on the staff login page.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  )
}
