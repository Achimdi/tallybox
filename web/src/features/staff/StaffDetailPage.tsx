import { KeyRound, UserCheck, UserX } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import type { StaffMember } from '@/api/types'
import { Banner, ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PasswordField } from '@/components/PasswordField'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { useToast } from '@/components/toast-context'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/domain/rules'
import { useSessionUser } from '@/features/auth/session'
import { formatDateTime } from '@/lib/dates'
import { AppError, toAppError } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useResetStaffPassword, useSetStaffActive, useStaffList } from './api'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-normal text-ink-muted">{label}</dt>
      <dd className="text-body break-words text-ink">{children}</dd>
    </div>
  )
}

/** Sets a new temporary password. The owner tells the staff member in person. */
function ResetPassword({ member }: { member: StaffMember }) {
  const online = useOnlineStatus()
  const reset = useResetStaffPassword()
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | undefined>()
  const [error, setError] = useState<AppError | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < PASSWORD_MIN)
      return setProblem(`Use at least ${PASSWORD_MIN} characters.`)
    if (password.length > PASSWORD_MAX) return setProblem(`Use at most ${PASSWORD_MAX} characters.`)
    try {
      await reset.mutateAsync({ staffId: member.id, newPassword: password })
      setPassword('')
      setDone(true)
    } catch (thrown) {
      setError(toAppError(thrown))
    }
  }

  return (
    <section
      aria-labelledby="reset-title"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-5 shadow-soft"
    >
      <h2 id="reset-title" className="text-title text-ink">
        Reset password
      </h2>
      {done ? (
        <Banner
          tone="success"
          title="Password changed"
          description={`Tell ${member.displayName} the new password in person. It isn't shown again. They can change it after signing in.`}
        />
      ) : (
        <p className="text-body text-ink-muted">
          For when {member.displayName} forgets theirs. Choose a temporary password and tell them in
          person.
        </p>
      )}
      <ErrorBanner error={error} />
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <PasswordField
          label="New temporary password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setProblem(undefined)
            setDone(false)
          }}
          error={problem}
          hint={`At least ${PASSWORD_MIN} characters.`}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={reset.isPending}
          loadingLabel="Saving…"
          disabled={!online}
          leadingIcon={<KeyRound aria-hidden="true" className="size-5" />}
        >
          Set new password
        </Button>
      </form>
    </section>
  )
}

/** One staff account: details, reset password, turn off or back on. */
export default function StaffDetailPage() {
  const { staffId = '' } = useParams()
  const user = useSessionUser()
  const timezone = user.timezone ?? 'UTC'
  const toast = useToast()
  const online = useOnlineStatus()
  const staff = useStaffList()
  const setActive = useSetStaffActive()
  const [confirming, setConfirming] = useState(false)

  if (staff.isPending) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading staff member</span>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    )
  }
  const member = staff.data?.find((candidate) => candidate.id === staffId)
  if (staff.isError || !member) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/owner/staff" label="Staff" />
        <ErrorState
          headingLevel={1}
          error={staff.error ?? new AppError('not_found')}
          {...(staff.isError ? { onRetry: () => void staff.refetch() } : {})}
        />
      </div>
    )
  }

  const toggle = () => {
    setActive.mutate(
      { staffId: member.id, active: !member.active },
      {
        onSuccess: () =>
          toast({
            title: member.active
              ? `${member.displayName} turned off`
              : `${member.displayName} turned back on`,
            tone: 'success',
          }),
        onError: () =>
          toast({ title: "Couldn't change it", description: 'Try again.', tone: 'error' }),
        onSettled: () => setConfirming(false),
      },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <BackLink to="/owner/staff" label="Staff" />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-title-lg break-words text-ink">{member.displayName}</h1>
        {member.active ? (
          <StatusChip status="active" />
        ) : (
          <StatusChip status="suspended" label="Turned off" />
        )}
      </header>

      {!member.active ? (
        <Banner
          tone="info"
          title="This account is turned off"
          description={`${member.displayName} can't sign in. Their past orders are kept. Turn it back on at any time.`}
        />
      ) : null}

      <section
        aria-label="Sign-in details"
        className="rounded-card border border-line bg-surface-raised p-5 shadow-soft"
      >
        <dl className="grid grid-cols-2 gap-4">
          <Detail label="Business code">{user.businessCode}</Detail>
          <Detail label="Username">{member.username}</Detail>
          <Detail label="Created">{formatDateTime(new Date(member.createdAt), timezone)}</Detail>
          <Detail label="Last signed in">
            {member.lastLoginAt ? formatDateTime(new Date(member.lastLoginAt), timezone) : 'Never'}
          </Detail>
        </dl>
      </section>

      {member.active ? <ResetPassword member={member} /> : null}

      <Button
        variant={member.active ? 'secondary' : 'primary'}
        onClick={() => (member.active ? setConfirming(true) : toggle())}
        loading={setActive.isPending && !confirming}
        disabled={!online}
        leadingIcon={
          member.active ? (
            <UserX aria-hidden="true" className="size-5" />
          ) : (
            <UserCheck aria-hidden="true" className="size-5" />
          )
        }
      >
        {member.active ? 'Turn off account' : 'Turn account back on'}
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Turn off ${member.displayName}?`}
        description="They are signed out and can't sign in again until you turn the account back on. Their past orders are kept."
        confirmLabel="Turn off"
        tone="danger"
        loading={setActive.isPending}
        onConfirm={toggle}
      />
    </div>
  )
}
