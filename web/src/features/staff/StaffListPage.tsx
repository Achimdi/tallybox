import { UserPlus } from 'lucide-react'
import { BackLink } from '@/components/BackLink'
import { ButtonLink } from '@/components/Button'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { useSessionUser } from '@/features/auth/session'
import { formatDateTime } from '@/lib/dates'
import { useStaffList } from './api'

/** The owner's staff accounts, with who is turned off and when each last signed in. */
export default function StaffListPage() {
  const user = useSessionUser()
  const timezone = user.timezone ?? 'UTC'
  const staff = useStaffList()

  let body
  if (staff.isPending) {
    body = <SkeletonList rows={3} label="Loading staff" />
  } else if (staff.isError) {
    body = (
      <div className="rounded-card border border-line bg-surface-raised">
        <ErrorState error={staff.error} onRetry={() => void staff.refetch()} />
      </div>
    )
  } else if (staff.data.length === 0) {
    body = (
      <div className="rounded-card border border-line bg-surface-raised">
        <EmptyState
          title="No staff accounts yet"
          description="Create one for each person who takes orders. They sign in with your business code and their own username."
          action={<ButtonLink to="/owner/staff/new">Create staff account</ButtonLink>}
        />
      </div>
    )
  } else {
    body = (
      <ListGroup>
        {staff.data.map((member) => (
          <ListItem
            key={member.id}
            to={`/owner/staff/${member.id}`}
            title={member.displayName}
            subtitle={[
              member.username,
              member.lastLoginAt
                ? `Last signed in ${formatDateTime(new Date(member.lastLoginAt), timezone)}`
                : 'Never signed in',
            ].join(' · ')}
            trailing={
              member.active ? (
                <StatusChip status="active" />
              ) : (
                <StatusChip status="suspended" label="Turned off" />
              )
            }
          />
        ))}
      </ListGroup>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <BackLink to="/owner/more" label="More" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-title-lg text-ink">Staff</h1>
          <p className="text-body text-ink-muted">
            Business code: <span className="font-semibold text-ink">{user.businessCode}</span>
          </p>
        </div>
        {staff.data && staff.data.length > 0 ? (
          <ButtonLink
            to="/owner/staff/new"
            leadingIcon={<UserPlus aria-hidden="true" className="size-5" />}
          >
            Add staff
          </ButtonLink>
        ) : null}
      </header>
      {body}
    </div>
  )
}
