import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { z } from 'zod'
import { Banner, ErrorBanner } from '@/components/Banner'
import { Button } from '@/components/Button'
import { PasswordField } from '@/components/PasswordField'
import { TextField } from '@/components/TextField'
import { DemoAccounts } from '@/features/demo/DemoAccounts'
import { toAppError, type AppError } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { AuthPage } from './AuthPage'
import { useSession } from './session'
import { useTurnstile } from './useTurnstile'

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email.')
    .pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.'),
})

type FormValues = z.infer<typeof schema>

/**
 * Owner sign-in. The same page signs in the developer (super-admin). After
 * signing in, the route guard sends each role to its own home.
 */
export default function OwnerLoginPage() {
  const { signIn } = useSession()
  const online = useOnlineStatus()
  const turnstile = useTurnstile()
  const [error, setError] = useState<AppError | null>(null)

  // Set by the registration page after a business is created.
  const registeredEmail = (useLocation().state as { registeredEmail?: string } | null)
    ?.registeredEmail

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: registeredEmail ?? '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await signIn({ portal: 'owner', ...values, captchaToken: turnstile.token ?? undefined })
    } catch (thrown) {
      setError(toAppError(thrown))
      turnstile.reset()
    }
  })

  const waitingForCheck = turnstile.enabled && !turnstile.token

  return (
    <AuthPage title="Owner login" subtitle="Sign in with the email you registered with.">
      {registeredEmail && !error ? (
        <Banner
          tone="success"
          title="Your business is registered"
          description="Sign in to finish setting up."
        />
      ) : null}

      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <ErrorBanner
          error={error}
          action={
            error?.code === 'wrong_portal' ? (
              <Link to="/login/staff" className="font-semibold text-primary underline">
                Go to staff login
              </Link>
            ) : undefined
          }
        />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {turnstile.element}
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={isSubmitting}
          loadingLabel="Signing in…"
          disabled={!online || waitingForCheck}
        >
          Sign in
        </Button>
        <Link
          to="/forgot-password"
          className="inline-flex min-h-12 items-center self-center px-2 text-label font-semibold text-primary underline"
        >
          Forgot password?
        </Link>
      </form>

      <DemoAccounts
        portal="owner"
        onUse={(account) => {
          setValue('email', account.email ?? '', { shouldValidate: true })
          setValue('password', account.password, { shouldValidate: true })
        }}
      />
    </AuthPage>
  )
}
