import { zodResolver } from '@hookform/resolvers/zod'
import {
  isValidUsername,
  LIMITS,
  normalizeUsername,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
} from '@/domain/rules'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { BackLink } from '@/components/BackLink'
import { Banner, ErrorBanner } from '@/components/Banner'
import { Button, ButtonLink } from '@/components/Button'
import { ListGroup, ListItem } from '@/components/ListItem'
import { PasswordField } from '@/components/PasswordField'
import { TextField } from '@/components/TextField'
import { useSession } from '@/features/auth/session'
import { useEntitlements } from '@/features/billing/useEntitlements'
import { toAppError, userMessage, type AppError } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import type { StaffMember } from '@/api/types'
import { useCreateStaff, useStaffList } from './api'

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter the staff member's name.")
    .max(LIMITS.displayNameMax, 'Use at most 80 characters.'),
  username: z
    .string()
    .transform(normalizeUsername)
    .refine(
      isValidUsername,
      `Use ${USERNAME_MIN} to ${USERNAME_MAX} lowercase letters or digits. Dots, hyphens and underscores are fine in the middle.`,
    ),
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

/** The owner creates a staff account: a name, a username and a temporary password. */
export default function CreateStaffPage() {
  const { session } = useSession()
  const online = useOnlineStatus()
  const entitlements = useEntitlements()
  const staffList = useStaffList()
  const createStaff = useCreateStaff()
  const [error, setError] = useState<AppError | null>(null)
  const [created, setCreated] = useState<StaffMember | null>(null)

  const businessCode = session.status === 'signed_in' ? session.user.businessCode : null

  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', username: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const staff = await createStaff.mutateAsync(values)
      setCreated(staff)
      reset()
    } catch (thrown) {
      const appError = toAppError(thrown)
      if (appError.code === 'username_taken' || appError.code === 'username_invalid') {
        const message = userMessage(appError)
        setFieldError('username', { message: `${message.title}. ${message.description}` })
      } else {
        setError(appError)
      }
    }
  })

  // The plan-limit seam. In v1 this always allows.
  const mayAddStaff = entitlements.canAdd('staff', staffList.data?.length ?? 0)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <BackLink to="/owner/staff" label="Staff" />
      <header className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">Create staff account</h1>
        <p className="text-body text-ink-muted">
          Staff can take orders. They can&apos;t see sales totals, reports or settings.
        </p>
      </header>

      {created ? (
        <section aria-labelledby="created-title" className="flex flex-col gap-4">
          <Banner
            tone="success"
            title={`${created.displayName} can now sign in`}
            description="Give them these details and the temporary password you chose. The password isn't shown again."
          />
          <h2 id="created-title" className="sr-only">
            Sign-in details
          </h2>
          <ListGroup>
            <ListItem title={businessCode ?? ''} subtitle="Business code" />
            <ListItem title={created.username} subtitle="Username" />
          </ListGroup>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => setCreated(null)}>Create another</Button>
            <ButtonLink to="/owner/staff" variant="secondary">
              Done
            </ButtonLink>
          </div>
        </section>
      ) : (
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          <ErrorBanner error={error} />
          <TextField
            label="Name"
            required
            autoComplete="off"
            hint="Shown on receipts and orders."
            error={errors.displayName?.message}
            {...register('displayName')}
          />
          <TextField
            label="Username"
            required
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            hint="What they type to sign in, for example chidi."
            error={errors.username?.message}
            {...register('username')}
          />
          <PasswordField
            label="Temporary password"
            required
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} characters. They can change it after signing in.`}
            error={errors.password?.message}
            {...register('password')}
          />
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={isSubmitting}
            loadingLabel="Creating…"
            disabled={!online || !mayAddStaff}
          >
            Create account
          </Button>
        </form>
      )}
    </div>
  )
}
