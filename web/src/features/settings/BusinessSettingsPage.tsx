import { zodResolver } from '@hookform/resolvers/zod'
import { ImageUp, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { BusinessSettings } from '@/api/types'
import { Banner, ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/Button'
import { SelectField } from '@/components/SelectField'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { LIMITS } from '@/domain/rules'
import { STOCK_LIMITS } from '@/domain/stock'
import { useBusinessSettings, useUpdateBusinessSettings } from '@/features/business/api'
import { toAppError, type AppError } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { LOGO_PROBLEM_TEXT, shrinkLogo } from './logo'

/** Currencies most likely to be used. The business's own currency is always offered too. */
const COMMON_CURRENCIES = [
  ['NGN', 'Nigerian naira'],
  ['GHS', 'Ghanaian cedi'],
  ['KES', 'Kenyan shilling'],
  ['UGX', 'Ugandan shilling'],
  ['TZS', 'Tanzanian shilling'],
  ['RWF', 'Rwandan franc'],
  ['ZAR', 'South African rand'],
  ['XOF', 'West African CFA franc'],
  ['XAF', 'Central African CFA franc'],
  ['EGP', 'Egyptian pound'],
  ['MAD', 'Moroccan dirham'],
  ['USD', 'US dollar'],
  ['GBP', 'British pound'],
  ['EUR', 'Euro'],
  ['CAD', 'Canadian dollar'],
  ['INR', 'Indian rupee'],
] as const

function currencyOptions(current: string) {
  const options = COMMON_CURRENCIES.map(([code, name]) => ({
    value: code,
    label: `${code} · ${name}`,
  }))
  return options.some((option) => option.value === current)
    ? options
    : [{ value: current, label: current }, ...options]
}

function timezoneOptions(current: string) {
  const zones = Intl.supportedValuesOf('timeZone')
  const all = zones.includes(current) ? zones : [current, ...zones]
  return all.map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }))
}

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(LIMITS.businessNameMin, 'Enter the business name.')
    .max(LIMITS.businessNameMax, `Use at most ${LIMITS.businessNameMax} characters.`),
  currencyCode: z.string(),
  timezone: z.string(),
  address: z.string().trim().max(200, 'Use at most 200 characters.'),
  phone: z.string().trim().max(LIMITS.phoneMax, `Use at most ${LIMITS.phoneMax} characters.`),
  receiptFooter: z.string().trim().max(200, 'Use at most 200 characters.'),
  defaultLowStockLevel: z
    .string()
    .trim()
    .refine(
      (value) => /^\d+$/.test(value) && Number(value) <= STOCK_LIMITS.maxLowStockLevel,
      'Enter a whole number, like 5.',
    ),
})

type FormValues = z.infer<typeof schema>

function SettingsForm({ settings }: { settings: BusinessSettings }) {
  const toast = useToast()
  const online = useOnlineStatus()
  const update = useUpdateBusinessSettings()
  const fileInput = useRef<HTMLInputElement>(null)
  // undefined: keep the saved logo. null: remove it. A string: the new one.
  const [logo, setLogo] = useState<string | null | undefined>(undefined)
  const [logoProblem, setLogoProblem] = useState<string | undefined>()
  const [error, setError] = useState<AppError | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: settings.name,
      currencyCode: settings.currencyCode,
      timezone: settings.timezone,
      address: settings.address ?? '',
      phone: settings.phone ?? '',
      receiptFooter: settings.receiptFooter ?? '',
      defaultLowStockLevel: String(settings.defaultLowStockLevel),
    },
  })
  const currencyChanged = useWatch({ control, name: 'currencyCode' }) !== settings.currencyCode
  const shownLogo = logo === undefined ? settings.logoUrl : logo

  const chooseLogo = async (file: File | undefined) => {
    if (!file) return
    setLogoProblem(undefined)
    const result = await shrinkLogo(file)
    if (result.ok) setLogo(result.dataUrl)
    else setLogoProblem(LOGO_PROBLEM_TEXT[result.problem])
  }

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await update.mutateAsync({
        ...values,
        defaultLowStockLevel: Number(values.defaultLowStockLevel),
        ...(logo === undefined ? {} : { logo }),
      })
      setLogo(undefined)
      toast({ title: 'Settings saved', tone: 'success' })
    } catch (thrown) {
      setError(toAppError(thrown))
    }
  })

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
      <ErrorBanner error={error} />

      <section aria-labelledby="logo-title" className="flex flex-col gap-3">
        <h2 id="logo-title" className="text-label text-ink">
          Logo
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-surface-sunken">
            {shownLogo ? (
              <img src={shownLogo} alt="Business logo" className="size-full object-contain" />
            ) : (
              <span className="text-caption text-ink-muted">No logo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => fileInput.current?.click()}
              leadingIcon={<ImageUp aria-hidden="true" className="size-5" />}
            >
              {shownLogo ? 'Change' : 'Add logo'}
            </Button>
            {shownLogo ? (
              <Button
                variant="ghost"
                onClick={() => setLogo(null)}
                leadingIcon={<Trash2 aria-hidden="true" className="size-5" />}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a logo picture"
          onChange={(event) => {
            void chooseLogo(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <p className="text-label font-normal text-ink-muted">
          Shown on receipts. It is shrunk to a small size before saving.
        </p>
        {logoProblem ? (
          <p className="text-label font-medium text-error-strong">{logoProblem}</p>
        ) : null}
      </section>

      <TextField
        label="Business name"
        required
        autoComplete="organization"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Business code"
        value={settings.businessCode}
        readOnly
        hint="Staff type this to sign in. It can't be changed."
      />
      <SelectField
        label="Currency"
        options={currencyOptions(settings.currencyCode)}
        {...register('currencyCode')}
      />
      {currencyChanged ? (
        <Banner
          tone="warning"
          title="Prices are not converted"
          description="Every price keeps its number and just shows the new currency. Past orders and reports change their symbol too. Only do this if you set the wrong currency."
        />
      ) : null}
      <SelectField
        label="Time zone"
        options={timezoneOptions(settings.timezone)}
        hint="Decides when your business day starts and ends."
        {...register('timezone')}
      />
      <TextField
        label="Address"
        autoComplete="street-address"
        hint="Optional. Shown on receipts."
        error={errors.address?.message}
        {...register('address')}
      />
      <TextField
        label="Phone"
        type="tel"
        autoComplete="tel"
        hint="Optional. Shown on receipts."
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Receipt message"
        autoComplete="off"
        placeholder="Thank you for shopping with us"
        hint="Optional. Printed at the bottom of every receipt."
        error={errors.receiptFooter?.message}
        {...register('receiptFooter')}
      />
      <TextField
        label="Default low-stock level"
        inputMode="numeric"
        autoComplete="off"
        hint="Used for new items when you don't set one."
        error={errors.defaultLowStockLevel?.message}
        {...register('defaultLowStockLevel')}
      />
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={isSubmitting}
        loadingLabel="Saving…"
        disabled={!online}
      >
        Save settings
      </Button>
    </form>
  )
}

/** The owner's business details: name, logo, currency, time zone and receipt text. */
export default function BusinessSettingsPage() {
  const settings = useBusinessSettings()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <BackLink to="/owner/more" label="More" />
      <h1 className="text-title-lg text-ink">Business settings</h1>
      {settings.isPending ? (
        <div role="status" className="flex flex-col gap-4">
          <span className="sr-only">Loading settings</span>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm settings={settings.data} />
      )}
    </div>
  )
}
