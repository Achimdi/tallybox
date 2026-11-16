import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import type { Supply } from '@/api/types'
import { ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/Button'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { SUPPLY_LIMITS } from '@/domain/supplies'
import { useSessionUser } from '@/features/auth/session'
import { AppError, toAppError, userMessage } from '@/lib/errors'
import { minorToInputValue, parseMoney } from '@/lib/money'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useSupplies, useSupplyCosts, useUpsertSupply } from './api'

const wholeNumber = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), message)

function formSchema(currency: string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter the supply name.')
      .max(SUPPLY_LIMITS.nameMax, `Use at most ${SUPPLY_LIMITS.nameMax} characters.`),
    unit: z
      .string()
      .trim()
      .max(SUPPLY_LIMITS.unitMax, `Use at most ${SUPPLY_LIMITS.unitMax} characters.`),
    costPrice: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || parseMoney(value, currency) !== null,
        'Enter an amount like 60.00',
      ),
    openingQuantity: wholeNumber('Enter a whole number, like 1000.'),
    lowStockLevel: wholeNumber('Enter a whole number, like 100.'),
  })
}

type FormValues = z.infer<ReturnType<typeof formSchema>>

function SupplyForm({ supply, costPrice }: { supply: Supply | null; costPrice: number | null }) {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const upsert = useUpsertSupply()
  const [newId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<AppError | null>(null)
  const editing = supply !== null

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema(currency)),
    defaultValues: {
      name: supply?.name ?? '',
      unit: supply?.unit ?? '',
      costPrice: costPrice !== null ? minorToInputValue(costPrice, currency) : '',
      openingQuantity: '',
      lowStockLevel: supply ? String(supply.lowStockLevel) : '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const saved = await upsert.mutateAsync({
        supplyId: supply?.id ?? newId,
        name: values.name,
        unit: values.unit,
        costPrice: values.costPrice === '' ? null : parseMoney(values.costPrice, currency),
        lowStockLevel: values.lowStockLevel === '' ? null : Number(values.lowStockLevel),
        openingQuantity:
          editing || values.openingQuantity === '' ? 0 : Number(values.openingQuantity),
      })
      toast({ title: editing ? 'Supply saved' : 'Supply added', tone: 'success' })
      await navigate(`/owner/supplies/${saved.id}`, { replace: true })
    } catch (thrown) {
      const appError = toAppError(thrown)
      if (appError.code === 'supply_name_taken') {
        const message = userMessage(appError)
        setFieldError(
          'name',
          { message: `${message.title}. ${message.description}` },
          { shouldFocus: true },
        )
      } else {
        setError(appError)
      }
    }
  })

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <ErrorBanner error={error} />
      <TextField
        label="Name"
        required
        autoComplete="off"
        placeholder="300 ml bottle"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Unit"
        autoComplete="off"
        placeholder="bottle, cap, pack…"
        hint="Optional. How one of it is counted."
        error={errors.unit?.message}
        {...register('unit')}
      />
      <TextField
        label={`Cost price (${currency})`}
        inputMode="decimal"
        autoComplete="off"
        hint="Optional. Only you see it. Used for stock value."
        error={errors.costPrice?.message}
        {...register('costPrice')}
      />
      {editing ? null : (
        <TextField
          label="Opening quantity"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          hint="How many you have now. Nothing is used up until items that share it are sold."
          error={errors.openingQuantity?.message}
          {...register('openingQuantity')}
        />
      )}
      <TextField
        label="Low-stock level"
        inputMode="numeric"
        autoComplete="off"
        hint="Flag the supply when this many or fewer are left."
        error={errors.lowStockLevel?.message}
        {...register('lowStockLevel')}
      />
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={isSubmitting}
        loadingLabel="Saving…"
        disabled={!online}
      >
        {editing ? 'Save changes' : 'Add supply'}
      </Button>
    </form>
  )
}

/** Add a supply (/owner/supplies/new) or edit one (/owner/supplies/:supplyId/edit). */
export default function SupplyFormPage() {
  const { supplyId } = useParams()
  const supplies = useSupplies()
  const costs = useSupplyCosts()
  const editing = supplyId !== undefined
  const supply = editing
    ? (supplies.data?.find((candidate) => candidate.id === supplyId) ?? null)
    : null

  let body
  if (editing && (supplies.isPending || costs.isPending)) {
    body = (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading supply</span>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    )
  } else if (editing && (supplies.isError || costs.isError)) {
    body = (
      <ErrorState error={supplies.error ?? costs.error} onRetry={() => void supplies.refetch()} />
    )
  } else if (editing && !supply) {
    body = <ErrorState error={new AppError('not_found')} />
  } else {
    body = (
      <SupplyForm supply={supply} costPrice={supply ? (costs.data?.[supply.id] ?? null) : null} />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <BackLink
        to={editing ? `/owner/supplies/${supplyId}` : '/owner/supplies'}
        label={editing ? 'Supply' : 'Supplies'}
      />
      <h1 className="text-title-lg text-ink">{editing ? 'Edit supply' : 'Add supply'}</h1>
      {body}
    </div>
  )
}
