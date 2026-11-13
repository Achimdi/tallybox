import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { useApi } from '@/api/context'
import { ErrorBanner } from '@/components/Banner'
import { Button } from '@/components/Button'
import { ListGroup, ListItem } from '@/components/ListItem'
import { PasswordField } from '@/components/PasswordField'
import { SectionHeader } from '@/components/SectionHeader'
import { useToast } from '@/components/toast-context'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/domain/rules'
import { useSession, useSessionUser } from '@/features/auth/session'
import { toAppError, userMessage } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z
      .string()
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
      .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
    repeatPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.repeatPassword, {
    path: ['repeatPassword'],
    message: "The two new passwords don't match.",
  })

type FormValues = z.infer<typeof schema>

const ROLE_LABEL = { staff: 'Staff', owner: 'Owner', super_admin: 'Developer' } as const

/** Who you are, where you work, change your password, sign out. */
export default function ProfilePage() {
  const api = useApi()
  const user = useSessionUser()
  const { signOut } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const change = useMutation({
    mutationFn: (values: FormValues) =>
      api.auth.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
  })

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', repeatPassword: '' },
  })

  const onSubmit = handleSubmit((values) => {
    change.mutate(values, {
      onSuccess: () => {
        reset()
        toast({ title: 'Password changed', tone: 'success' })
      },
      onError: (error) => {
        const appError = toAppError(error)
        const message = userMessage(appError)
        if (appError.code === 'wrong_password') {
          setError('currentPassword', { message: message.title })
        } else if (appError.code === 'weak_password') {
          setError('newPassword', { message: `${message.title}. ${message.description}` })
        }
      },
    })
  })

  const otherError =
    change.error && !['wrong_password', 'weak_password'].includes(toAppError(change.error).code)
      ? change.error
      : null

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-title-lg text-ink">Profile</h1>

      <ListGroup>
        <ListItem title={user.displayName} subtitle={ROLE_LABEL[user.role]} />
        {user.username ? <ListItem title={user.username} subtitle="Username" /> : null}
        {user.email ? <ListItem title={user.email} subtitle="Email" /> : null}
        {user.businessName ? (
          <ListItem
            title={user.businessName}
            subtitle={`Business code: ${user.businessCode ?? ''}`}
          />
        ) : null}
      </ListGroup>

      <section aria-labelledby="password-title" className="flex flex-col gap-3">
        <SectionHeader title="Change password" />
        <span id="password-title" className="sr-only">
          Change password
        </span>
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          <ErrorBanner error={otherError} />
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} characters.`}
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <PasswordField
            label="New password again"
            autoComplete="new-password"
            error={errors.repeatPassword?.message}
            {...register('repeatPassword')}
          />
          <div>
            <Button
              type="submit"
              loading={change.isPending}
              loadingLabel="Saving…"
              disabled={!online}
            >
              Change password
            </Button>
          </div>
        </form>
      </section>

      <Button
        variant="secondary"
        onClick={() => {
          void navigate('/', { replace: true })
          signOut()
        }}
        leadingIcon={<LogOut aria-hidden="true" className="size-5" />}
      >
        Sign out
      </Button>
    </div>
  )
}
