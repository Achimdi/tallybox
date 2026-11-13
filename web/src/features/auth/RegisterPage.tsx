import { zodResolver } from '@hookform/resolvers/zod'
import {
  businessCodeProblem,
  isValidBusinessCode,
  isWellFormedActivationCode,
  LIMITS,
  normalizeBusinessCode,
  PASSWORD_MAX,
  PASSWORD_MIN,
  type BusinessCodeProblem,
} from '@/domain/rules'
import { useQuery } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { Banner, ErrorBanner } from '@/components/Banner'
import { Button } from '@/components/Button'
import { PasswordField } from '@/components/PasswordField'
import { TextField } from '@/components/TextField'
import { SUPPORT_EMAIL } from '@/lib/config'
import { toAppError, userMessage, type AppError, type AppErrorCode } from '@/lib/errors'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { isBusinessCodeAvailable, registerBusiness } from './api'
import { AuthPage } from './AuthPage'
import { useTurnstile } from './useTurnstile'

const BUSINESS_CODE_MESSAGES: Record<BusinessCodeProblem, string> = {
  too_short: 'Use at least 3 characters.',
  too_long: 'Use at most 20 characters.',
  characters: 'Use only lowercase letters, digits and hyphens.',
  hyphens: "Don't start or end with a hyphen, or use two in a row.",
  reserved: "That code isn't available. Choose another.",
}

const schema = z.object({
  businessName: z
    .string()
    .trim()
    .min(LIMITS.businessNameMin, 'Enter your business name (at least 2 characters).')
    .max(LIMITS.businessNameMax, 'Use at most 80 characters.'),
  businessCode: z
    .string()
    .transform(normalizeBusinessCode)
    .superRefine((code, context) => {
      const problem = businessCodeProblem(code)
      if (problem) context.addIssue({ code: 'custom', message: BUSINESS_CODE_MESSAGES[problem] })
    }),
  ownerName: z
    .string()
    .trim()
    .min(1, 'Enter your full name.')
    .max(LIMITS.displayNameMax, 'Use at most 80 characters.'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email.')
    .pipe(z.email('Enter a valid email address.')),
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
  phone: z.string().trim().max(LIMITS.phoneMax, 'Use at most 30 characters.'),
  activationCode: z
    .string()
    .refine(
      isWellFormedActivationCode,
      'Enter the code exactly as you received it, like TB-7K4M-X9QD.',
    ),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

/** Server refusals that belong to one field rather than to the whole form. */
const FIELD_FOR_CODE: Partial<Record<AppErrorCode, keyof FormInput>> = {
  business_code_taken: 'businessCode',
  business_code_invalid: 'businessCode',
  email_taken: 'email',
  weak_password: 'password',
  activation_code_invalid: 'activationCode',
  activation_code_used: 'activationCode',
  activation_code_revoked: 'activationCode',
  activation_code_expired: 'activationCode',
}

/** Register a business with a single-use activation code. Approval is automatic. */
export default function RegisterPage() {
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const turnstile = useTurnstile()
  const [error, setError] = useState<AppError | null>(null)

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      businessName: '',
      businessCode: '',
      ownerName: '',
      email: '',
      password: '',
      phone: '',
      activationCode: '',
    },
  })

  // Check the business code against the server while the person types.
  const typedCode = normalizeBusinessCode(useWatch({ control, name: 'businessCode' }) ?? '')
  const codeToCheck = useDebouncedValue(typedCode, 400)
  const availability = useQuery({
    queryKey: ['business-code-available', codeToCheck],
    queryFn: () => isBusinessCodeAvailable(codeToCheck),
    enabled: online && isValidBusinessCode(codeToCheck),
    staleTime: 30_000,
    retry: false,
  })
  const settled = codeToCheck === typedCode && isValidBusinessCode(typedCode)
  const codeIsFree = settled && availability.data === true
  const codeIsTaken = settled && availability.data === false

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    if (!turnstile.token) return
    try {
      await registerBusiness({ ...values, turnstileToken: turnstile.token })
      await navigate('/login/owner', { replace: true, state: { registeredEmail: values.email } })
    } catch (thrown) {
      const appError = toAppError(thrown)
      const field = FIELD_FOR_CODE[appError.code]
      if (field) {
        const message = userMessage(appError)
        setFieldError(
          field,
          { message: `${message.title}. ${message.description}` },
          { shouldFocus: true },
        )
      } else {
        setError(appError)
      }
      turnstile.reset()
    }
  })

  return (
    <AuthPage
      title="Register your business"
      subtitle="You need the activation code that Tallybox sent you."
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <ErrorBanner error={error} />

        <TextField
          label="Business name"
          required
          autoComplete="organization"
          error={errors.businessName?.message}
          {...register('businessName')}
        />

        <div className="flex flex-col gap-1.5">
          <TextField
            label="Business code"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            hint="Your staff type this to sign in. 3 to 20 lowercase letters, digits or hyphens. It can't be changed later."
            error={
              errors.businessCode?.message ??
              (codeIsTaken ? 'That business code is taken. Choose another.' : undefined)
            }
            {...register('businessCode')}
          />
          <p aria-live="polite" className="min-h-5 text-label font-medium">
            {codeIsFree ? (
              <span className="flex items-center gap-1.5 text-success">
                <CircleCheck aria-hidden="true" className="size-4" />
                {typedCode} is available
              </span>
            ) : settled && availability.isFetching ? (
              <span className="font-normal text-ink-muted">Checking…</span>
            ) : null}
          </p>
        </div>

        <TextField
          label="Your full name"
          required
          autoComplete="name"
          error={errors.ownerName?.message}
          {...register('ownerName')}
        />
        <TextField
          label="Email"
          required
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          hint="Use the email the activation code was sent for."
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          required
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint="Optional. Shown on receipts."
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          label="Activation code"
          required
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="TB-XXXX-XXXX"
          error={errors.activationCode?.message}
          {...register('activationCode')}
        />

        {turnstile.enabled ? (
          turnstile.element
        ) : (
          <Banner
            tone="info"
            title="Registration isn't switched on yet"
            description={`The security check hasn't been set up. Contact ${SUPPORT_EMAIL}.`}
          />
        )}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={isSubmitting}
          loadingLabel="Registering…"
          disabled={!online || !turnstile.token || codeIsTaken}
        >
          Register business
        </Button>
        <p className="text-center text-label font-normal text-ink-muted">
          No activation code? Contact {SUPPORT_EMAIL}.
        </p>
      </form>
    </AuthPage>
  )
}
