import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { GeneratedCode } from '@/api/types'
import { DEFAULT_REDEEM_DAYS, MAX_REDEEM_DAYS } from '@/domain/activationCodes'
import { LIMITS } from '@/domain/rules'
import { ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button, ButtonLink } from '@/components/Button'
import { buttonClasses } from '@/components/button-styles'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { cn } from '@/lib/cn'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import {
  accessLengthLabel,
  formatDay,
  MY_TIMEZONE,
  resolveAccessChoice,
  type AccessChoice,
} from './access'
import { AccessLengthPicker } from './AccessLengthPicker'
import { useGenerateActivationCode } from './api'
import { activationMessage, whatsAppShareUrl } from './whatsapp'

const schema = z.object({
  ownerEmail: z
    .string()
    .trim()
    .min(1, "Enter the owner's email.")
    .pipe(z.email('Enter a valid email address.')),
  note: z.string().trim().max(LIMITS.noteMax, 'Use at most 200 characters.'),
  redeemDays: z
    .number({ error: 'Enter a number of days.' })
    .int('Use a whole number of days.')
    .min(1, 'Use at least 1 day.')
    .max(MAX_REDEEM_DAYS, `Use at most ${MAX_REDEEM_DAYS} days.`),
})

type FormValues = z.infer<typeof schema>

/** Developer portal: create a single-use code for one owner email. */
export default function GenerateCodePage() {
  const toast = useToast()
  const online = useOnlineStatus()
  const generate = useGenerateActivationCode()
  const [fresh, setFresh] = useState<GeneratedCode | null>(null)
  const [choice, setChoice] = useState<AccessChoice>('30')
  const [customDays, setCustomDays] = useState('')
  const [accessError, setAccessError] = useState<string | undefined>(undefined)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ownerEmail: '', note: '', redeemDays: DEFAULT_REDEEM_DAYS },
  })

  const onSubmit = handleSubmit((values) => {
    const accessDays = resolveAccessChoice(choice, customDays)
    if (accessDays === undefined) {
      setAccessError('Enter a whole number of days from 1 to 3650.')
      return
    }
    setAccessError(undefined)
    generate.mutate(
      { ...values, accessDays },
      {
        onSuccess: (code) => {
          setFresh(code)
          reset()
          setChoice('30')
          setCustomDays('')
        },
      },
    )
  })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Copied', tone: 'success' })
    } catch {
      toast({
        title: "Couldn't copy",
        description: 'Select the code and copy it by hand.',
        tone: 'error',
      })
    }
  }

  const registerUrl = `${window.location.origin}/register`

  if (fresh) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <BackLink to="/admin/codes" label="Codes" />
        <section
          aria-labelledby="fresh-title"
          className="flex flex-col gap-4 rounded-card border-2 border-primary bg-surface-raised p-5 shadow-soft"
        >
          <div className="flex flex-col gap-1">
            <h1 id="fresh-title" className="text-label text-ink-muted">
              New code for {fresh.ownerEmail}
            </h1>
            <p className="text-display tracking-wider text-ink tabular-nums select-all">
              {fresh.code}
            </p>
            <p className="text-label font-normal text-ink-muted">
              Shown only this once: copy or share it now. Redeem by {formatDay(fresh.redeemBy)}.
              Access: {accessLengthLabel(fresh.accessDays)} from registration.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => void copy(fresh.code)}
              leadingIcon={<Copy aria-hidden="true" className="size-5" />}
            >
              Copy code
            </Button>
            <a
              href={whatsAppShareUrl(activationMessage(fresh, registerUrl, MY_TIMEZONE))}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonClasses({ variant: 'secondary' }), 'hover:bg-surface-sunken')}
            >
              <MessageCircle aria-hidden="true" className="size-5" />
              <span>Share on WhatsApp</span>
            </a>
          </div>
        </section>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/admin/codes" variant="secondary">
            Done
          </ButtonLink>
          <Button variant="ghost" onClick={() => setFresh(null)}>
            Generate another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <BackLink to="/admin/codes" label="Codes" />
      <header className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">Generate a code</h1>
        <p className="text-body text-ink-muted">
          One code per new business. Only the owner email below can use it, and only once.
        </p>
      </header>

      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
        <ErrorBanner error={generate.error} />
        <TextField
          label="Owner's email"
          required
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.ownerEmail?.message}
          {...register('ownerEmail')}
        />
        <TextField
          label="Note"
          autoComplete="off"
          hint="Optional. For example the client's name."
          error={errors.note?.message}
          {...register('note')}
        />
        <TextField
          label="Redeem within (days)"
          required
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_REDEEM_DAYS}
          hint="How long the code can be used to register. Not how long the business keeps access."
          error={errors.redeemDays?.message}
          {...register('redeemDays', { valueAsNumber: true })}
        />
        <AccessLengthPicker
          label="Access length"
          hint="How long the business may use Tallybox after it registers. You can extend it later."
          choice={choice}
          customDays={customDays}
          onChoiceChange={(value) => {
            setChoice(value)
            setAccessError(undefined)
          }}
          onCustomDaysChange={setCustomDays}
          customError={accessError}
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={generate.isPending}
          loadingLabel="Generating…"
          disabled={!online}
        >
          Generate code
        </Button>
      </form>
    </div>
  )
}
