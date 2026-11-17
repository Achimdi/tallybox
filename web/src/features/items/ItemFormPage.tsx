import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import type { Item } from '@/api/types'
import { ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/Button'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { isUnitName, STOCK_LIMITS, UNIT_IS_A_NUMBER } from '@/domain/stock'
import { useSessionUser } from '@/features/auth/session'
import { useBusinessSettings } from '@/features/business/api'
import { AppError, toAppError, userMessage } from '@/lib/errors'
import { minorToInputValue, minorUnitDigits, parseMoney } from '@/lib/money'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useSupplies } from '@/features/supplies/api'
import { categoriesOf, useItemCosts, useItems, useUpsertItem } from './api'
import { StockModeFields, stockModeProblems, type StockModeDraft } from './StockModeFields'

const wholeNumber = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d+$/.test(value), message)

function formSchema(currency: string) {
  const money = (label: string, required: boolean) =>
    z
      .string()
      .trim()
      .refine((value) => (required ? value !== '' : true), `Enter the ${label}.`)
      .refine(
        (value) => value === '' || parseMoney(value, currency) !== null,
        minorUnitDigits(currency) > 0
          ? 'Enter an amount like 1,250.50'
          : 'Enter a whole amount like 1,250',
      )
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter the item name.')
      .max(STOCK_LIMITS.itemNameMax, 'Use at most 80 characters.'),
    category: z.string().trim().max(STOCK_LIMITS.categoryMax, 'Use at most 40 characters.'),
    unit: z
      .string()
      .trim()
      .max(STOCK_LIMITS.unitMax, 'Use at most 20 characters.')
      .refine(isUnitName, UNIT_IS_A_NUMBER),
    price: money('selling price', true),
    costPrice: money('cost price', false),
    openingQuantity: wholeNumber('Enter a whole number, like 24.'),
    lowStockLevel: wholeNumber('Enter a whole number, like 5.'),
  })
}

type FormValues = z.infer<ReturnType<typeof formSchema>>

interface ItemFormProps {
  item: Item | null
  costPrice: number | null
}

function ItemForm({ item, costPrice }: ItemFormProps) {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const items = useItems()
  const settings = useBusinessSettings()
  const upsert = useUpsertItem()
  const listId = useId()
  // One id per new item, so saving twice never creates two.
  const [newId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<AppError | null>(null)
  const editing = item !== null
  const supplies = useSupplies()
  const initialMode: StockModeDraft = {
    tracksOwnStock: item?.tracksOwnStock ?? true,
    usesSupplies: (item?.supplies.length ?? 0) > 0,
    supplies: (item?.supplies ?? []).map((use) => ({
      key: use.supplyId,
      supplyId: use.supplyId,
      unitsPerSale: String(use.unitsPerSale),
    })),
  }
  const [mode, setMode] = useState<StockModeDraft>(initialMode)
  const [modeErrors, setModeErrors] = useState(false)
  const modeOf = (draft: StockModeDraft) => ({
    tracksOwnStock: draft.tracksOwnStock,
    supplies: draft.usesSupplies
      ? draft.supplies.map((row) => ({
          supplyId: row.supplyId,
          unitsPerSale: Number(row.unitsPerSale),
        }))
      : [],
  })
  const modeChanged = JSON.stringify(modeOf(mode)) !== JSON.stringify(modeOf(initialMode))

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema(currency)),
    defaultValues: {
      name: item?.name ?? '',
      category: item?.category ?? '',
      unit: item?.unit ?? '',
      price: item ? minorToInputValue(item.price, currency) : '',
      costPrice: costPrice !== null ? minorToInputValue(costPrice, currency) : '',
      openingQuantity: '',
      lowStockLevel: item ? String(item.lowStockLevel) : '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    setModeErrors(true)
    const problems = stockModeProblems(mode)
    if (problems.supplies || Object.keys(problems.rows).length > 0) return
    try {
      const saved = await upsert.mutateAsync({
        itemId: item?.id ?? newId,
        name: values.name,
        category: values.category,
        unit: values.unit,
        price: parseMoney(values.price, currency) ?? 0,
        costPrice: values.costPrice === '' ? null : parseMoney(values.costPrice, currency),
        lowStockLevel: values.lowStockLevel === '' ? null : Number(values.lowStockLevel),
        openingQuantity:
          editing || !mode.tracksOwnStock || values.openingQuantity === ''
            ? 0
            : Number(values.openingQuantity),
        ...modeOf(mode),
      })
      toast({ title: editing ? 'Item saved' : 'Item added', tone: 'success' })
      await navigate(`/owner/items/${saved.id}`, { replace: true })
    } catch (thrown) {
      const appError = toAppError(thrown)
      if (appError.code === 'item_name_taken') {
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

  const defaultLow = settings.data?.defaultLowStockLevel
  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <ErrorBanner error={error} />
      <TextField
        label="Name"
        required
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Category"
        autoComplete="off"
        list={listId}
        optional
        hint="Pick one you already use, or type a new one."
        error={errors.category?.message}
        {...register('category')}
      />
      <datalist id={listId}>
        {categoriesOf(items.data ?? []).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <TextField
        label="Unit name"
        autoComplete="off"
        placeholder="pack, bottle, piece…"
        optional
        hint="A word for one of this item, like pack or bottle. Not a number."
        error={errors.unit?.message}
        {...register('unit')}
      />
      <TextField
        label={`Selling price (${currency})`}
        required
        inputMode="decimal"
        autoComplete="off"
        error={errors.price?.message}
        {...register('price')}
      />
      <TextField
        label={`Cost price (${currency})`}
        inputMode="decimal"
        autoComplete="off"
        optional
        hint="Only you see it. Used for stock value and profit."
        error={errors.costPrice?.message}
        {...register('costPrice')}
      />
      <StockModeFields
        draft={mode}
        onChange={setMode}
        supplies={(supplies.data ?? []).filter((supply) => supply.active)}
        showErrors={modeErrors}
        editing={editing}
        changed={modeChanged}
      />
      {editing || !mode.tracksOwnStock ? null : (
        <TextField
          label="Opening quantity"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          hint="How many you have right now, for example 100. This is your stock: each sale takes from it. Later, add deliveries with Restock."
          error={errors.openingQuantity?.message}
          {...register('openingQuantity')}
        />
      )}
      <TextField
        label="Low-stock level"
        inputMode="numeric"
        autoComplete="off"
        placeholder={defaultLow !== undefined ? String(defaultLow) : ''}
        hint={`Flag the item when this many or fewer are left.${defaultLow !== undefined && !editing ? ` Leave blank for your default (${defaultLow}).` : ''}`}
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
        {editing ? 'Save changes' : 'Add item'}
      </Button>
    </form>
  )
}

/** Add an item (/owner/items/new) or edit one (/owner/items/:itemId/edit). */
export default function ItemFormPage() {
  const { itemId } = useParams()
  const items = useItems()
  const costs = useItemCosts()
  const editing = itemId !== undefined
  const item = editing ? (items.data?.find((candidate) => candidate.id === itemId) ?? null) : null

  let body
  if (editing && (items.isPending || costs.isPending)) {
    body = (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading item</span>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    )
  } else if (editing && (items.isError || costs.isError)) {
    body = <ErrorState error={items.error ?? costs.error} onRetry={() => void items.refetch()} />
  } else if (editing && !item) {
    body = <ErrorState error={new AppError('not_found')} />
  } else {
    body = <ItemForm item={item} costPrice={item ? (costs.data?.[item.id] ?? null) : null} />
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <BackLink
        to={editing ? `/owner/items/${itemId}` : '/owner/items'}
        label={editing ? 'Item' : 'Items'}
      />
      <h1 className="text-title-lg text-ink">{editing ? 'Edit item' : 'Add item'}</h1>
      {body}
    </div>
  )
}
