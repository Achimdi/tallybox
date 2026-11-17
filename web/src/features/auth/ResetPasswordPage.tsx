import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { useApi } from '@/api/context'
import { Banner, ErrorBanner } from '@/components/Banner'
import { Button, ButtonLink } from '@/components/Button'
import { PasswordField } from '@/components/PasswordField'
import { useToast } from '@/components/toast-context'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/domain/rules'
import { AppError, toAppError, userMessage } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { AuthPage } from './AuthPage'
import { useSession } from './session'

const schema = z
  .object({
    newPassword: z
      .string()
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
      .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
    repeatPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.repeatPassword, {
    path: ['repeatPassword'],
    message: "The two passwords don't match.",
  })

type FormValues = z.infer<typeof schema>

/**
 * Where an owner's one-time reset link lands (the developer portal makes the
 * link; v1 sends no email). The link is only used when the owner taps
 * Continue, because link previews in chat apps and email open links too, and
 * would otherwise use it up. Then they choose a new password and carry on to
 * their dashboard.
 */
export default function ResetPasswordPage() {
  const api = useApi()
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const { refresh } = useSession()
  const [params, setParams] = useSearchParams()
  const token = params.get('token')
  const [email, setEmail] = useState<string | null>(null)
  const open = useMutation({
    mutationFn: (value: string) => api.auth.openPasswordResetLink(value),
    onSuccess: (result) => {
      setEmail(result.email)
      // The token has done its job: take it out of the address and history.
      setParams({}, { replace: true })
    },
  })
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      api.auth.completePasswordReset({ newPassword: values.newPassword }),
  })

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', repeatPassword: '' },
  })

  const onSubmit = handleSubmit((values) => {
    save.mutate(values, {
      onSuccess: () => {
        toast({ title: 'Password changed', tone: 'success' })
        void refresh().then(() => navigate('/owner/dashboard', { replace: true }))
      },
      onError: (error) => {
        const appError = toAppError(error)
        if (appError.code === 'weak_password') {
          const message = userMessage(appError)
          setError('newPassword', { message: `${message.title}. ${message.description}` })
        }
      },
    })
  })

  const openError = open.error ? toAppError(open.error) : null
  const saveError = save.error ? toAppError(save.error) : null
  const expired =
    (!email && !token) ||
    openError?.code === 'reset_link_invalid' ||
    saveError?.code === 'reset_link_invalid'

  if (expired) {
    const message = userMessage(new AppError('reset_link_invalid'))
    return (
      <AuthPage title="Choose a new password">
        <Banner tone="warning" title={message.title} description={message.description} />
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/login/owner">Sign in</ButtonLink>
          <ButtonLink to="/forgot-password" variant="secondary">
            Forgot password help
          </ButtonLink>
        </div>
      </AuthPage>
    )
  }

  if (!email) {
    return (
      <AuthPage
        title="Choose a new password"
        subtitle="This one-time link lets you set a new password for your business account."
      >
        <ErrorBanner error={openError} />
        <Button
          size="lg"
          fullWidth
          loading={open.isPending}
          loadingLabel="Checking your link…"
          disabled={!online}
          onClick={() => token && open.mutate(token)}
        >
          Continue
        </Button>
      </AuthPage>
    )
  }

  return (
    <AuthPage title="Choose a new password" subtitle={`For ${email}`}>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <ErrorBanner error={saveError && saveError.code !== 'weak_password' ? saveError : null} />
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
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={save.isPending}
          loadingLabel="Saving…"
          disabled={!online}
        >
          Save new password
        </Button>
      </form>
    </AuthPage>
  )
}
