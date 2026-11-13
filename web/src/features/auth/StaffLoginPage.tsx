import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Banner, ErrorBanner } from '@/components/Banner'
import { Button } from '@/components/Button'
import { PasswordField } from '@/components/PasswordField'
import { TextField } from '@/components/TextField'
import { DemoAccounts } from '@/features/demo/DemoAccounts'
import { toAppError, type AppError, type AppErrorCode } from '@/lib/errors'
import { readStored, writeStored } from '@/lib/storage'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { AuthPage } from './AuthPage'
import { useSession } from './session'
import { useTurnstile } from './useTurnstile'

const BUSINESS_CODE_KEY = 'tb.business-code'

const schema = z.object({
  businessCode: z.string().trim().min(1, 'Enter your business code.'),
  username: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
})

type FormValues = z.infer<typeof schema>

/**
 * Failures that say something about the situation, not about the account.
 * Everything else gets ONE message, so nobody can use this page to find out
 * which businesses or usernames exist.
 */
const SPECIFIC: readonly AppErrorCode[] = [
  'offline',
  'rate_limited',
  'captcha_failed',
  'server',
  'config_missing',
  // These are only ever reported after the password was correct.
  'account_disabled',
  'business_suspended',
  'access_ended',
]

/** Staff sign-in: business code, username and password. */
export default function StaffLoginPage() {
  const { signIn } = useSession()
  const online = useOnlineStatus()
  const turnstile = useTurnstile()
  const [error, setError] = useState<AppError | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // Remembered on this device so staff only type it once.
      businessCode: readStored('local', BUSINESS_CODE_KEY) ?? '',
      username: '',
      password: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await signIn({ portal: 'staff', ...values, captchaToken: turnstile.token ?? undefined })
      writeStored('local', BUSINESS_CODE_KEY, values.businessCode.trim().toLowerCase())
    } catch (thrown) {
      setError(toAppError(thrown))
      turnstile.reset()
    }
  })

  const waitingForCheck = turnstile.enabled && !turnstile.token

  return (
    <AuthPage title="Staff login" subtitle="Ask the business owner for your sign-in details.">
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        {error && !SPECIFIC.includes(error.code) ? (
          <Banner
            tone="error"
            title="Check your business code, username and password"
            description="If you're not sure of them, ask the business owner."
          />
        ) : (
          <ErrorBanner error={error} />
        )}
        <TextField
          label="Business code"
          autoComplete="organization"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          hint="The owner chose this when they registered the business."
          error={errors.businessCode?.message}
          {...register('businessCode')}
        />
        <TextField
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={errors.username?.message}
          {...register('username')}
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
        <p className="text-center text-label font-normal text-ink-muted">
          Forgot your password? Ask the business owner to reset it.
        </p>
      </form>

      <DemoAccounts
        portal="staff"
        onUse={(account) => {
          setValue('businessCode', account.businessCode ?? '', { shouldValidate: true })
          setValue('username', account.username ?? '', { shouldValidate: true })
          setValue('password', account.password, { shouldValidate: true })
        }}
      />
    </AuthPage>
  )
}
