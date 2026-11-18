import { zodResolver } from '@hookform/resolvers/zod'
import { ImageUp, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { BusinessSettings } from '@/api/types'
import { Banner, ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/Button'
import { CheckboxField } from '@/components/CheckboxField'
import { RadioCards } from '@/components/RadioCards'
import { SelectField } from '@/components/SelectField'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import {
  receiptWatermark,
  WATERMARK_KINDS,
  WATERMARK_TEXT_MAX,
  type WatermarkKind,
} from '@/domain/receiptWatermark'
import { LIMITS } from '@/domain/rules'
import { STOCK_LIMITS } from '@/domain/stock'
import { useBusinessSettings, useUpdateBusinessSettings } from '@/features/business/api'
import { toAppError, type AppError } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { LOGO_PROBLEM_TEXT, shrinkLogo } from './logo'
import { WatermarkPreview } from './WatermarkPreview'

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

const WATERMARK_OPTIONS: readonly { value: WatermarkKind; label: string; description: string }[] = [
  {
    value: 'tallybox',
    label: 'Tallybox',
    description: 'The Tallybox mark and name, faint behind the receipt.',
  },
  { value: 'custom', label: 'Your own', description: 'Your own words, your logo, or both.' },
  { value: 'none', label: 'None', description: 'No watermark.' },
]

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
  watermarkKind: z.enum(WATERMARK_KINDS),
  watermarkText: z
    .string()
    .trim()
    .max(WATERMARK_TEXT_MAX, `Use at most ${WATERMARK_TEXT_MAX} characters.`),
  watermarkLogo: z.boolean(),
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
    setError: setFieldError,
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
      watermarkKind: settings.watermark.kind,
      watermarkText: settings.watermark.text ?? '',
      watermarkLogo: settings.watermark.useLogo,
      defaultLowStockLevel: String(settings.defaultLowStockLevel),
    },
  })
  const currencyChanged = useWatch({ control, name: 'currencyCode' }) !== settings.currencyCode
  const shownLogo = logo === undefined ? settings.logoUrl : logo
  const [previewName, previewCurrency, previewFooter, watermarkKind, watermarkText, watermarkLogo] =
    useWatch({
      control,
      name: [
        'name',
        'currencyCode',
        'receiptFooter',
        'watermarkKind',
        'watermarkText',
        'watermarkLogo',
      ],
    })
  // The logo only counts while there is one.
  const usesLogo = watermarkLogo && Boolean(shownLogo)

  const chooseLogo = async (file: File | undefined) => {
    if (!file) return
    setLogoProblem(undefined)
    const result = await shrinkLogo(file)
    if (result.ok) setLogo(result.dataUrl)
    else setLogoProblem(LOGO_PROBLEM_TEXT[result.problem])
  }

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    const { watermarkKind: kind, watermarkText: text, watermarkLogo: useLogo, ...details } = values
    const withLogo = useLogo && Boolean(shownLogo)
    if (kind === 'custom' && !text && !withLogo) {
      setFieldError('watermarkText', { message: 'Add some words, or use your logo.' })
      return
    }
    try {
      await update.mutateAsync({
        ...details,
        defaultLowStockLevel: Number(values.defaultLowStockLevel),
        ...(logo === undefined ? {} : { logo }),
        watermark: { kind, text, useLogo: withLogo },
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
        <div className="flex flex-wrap items-center gap-4">
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
        optional
        hint="Shown on receipts."
        error={errors.address?.message}
        {...register('address')}
      />
      <TextField
        label="Phone"
        type="tel"
        autoComplete="tel"
        optional
        hint="Shown on receipts."
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Receipt message"
        autoComplete="off"
        placeholder="Thank you for shopping with us"
        optional
        hint="Printed at the bottom of every receipt."
        error={errors.receiptFooter?.message}
        {...register('receiptFooter')}
      />
      <Controller
        control={control}
        name="watermarkKind"
        render={({ field }) => (
          <RadioCards
            legend="Receipt watermark"
            description="A faint mark behind every receipt. Your logo, if you add one, also stays at the top."
            value={field.value}
            options={WATERMARK_OPTIONS}
            onChange={field.onChange}
          />
        )}
      />
      {watermarkKind === 'custom' ? (
        <div className="flex flex-col gap-3">
          <TextField
            label="Watermark words"
            autoComplete="off"
            optional
            placeholder={settings.name}
            hint={`Up to ${WATERMARK_TEXT_MAX} characters, like your business name.`}
            error={errors.watermarkText?.message}
            {...register('watermarkText')}
          />
          <Controller
            control={control}
            name="watermarkLogo"
            render={({ field }) => (
              <CheckboxField
                label="Use my logo"
                description={
                  shownLogo
                    ? 'Your logo, in grey, above the words.'
                    : 'Add a logo at the top of this page first.'
                }
                checked={usesLogo}
                disabled={!shownLogo}
                onChange={field.onChange}
              />
            )}
          />
        </div>
      ) : null}
      <WatermarkPreview
        businessName={previewName}
        currencyCode={previewCurrency}
        logoUrl={shownLogo}
        footer={previewFooter}
        watermark={receiptWatermark(
          {
            kind: watermarkKind,
            text: watermarkText.replace(/\s+/g, ' ').trim() || null,
            useLogo: usesLogo,
          },
          shownLogo,
        )}
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
