import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { Item } from '@/api/types'
import { Banner, ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FilterChips } from '@/components/FilterChips'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import {
  ADJUST_REASONS,
  adjustReasonLabel,
  describeAdjustment,
  STOCK_LIMITS,
  type AdjustReason,
} from '@/domain/stock'
import { useItems } from '@/features/items/api'
import { AppError, toAppError } from '@/lib/errors'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useAdjustStock } from './api'

function AdjustForm({ item }: { item: Item }) {
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const adjust = useAdjustStock()
  // The number shown when counting started. If stock changes meanwhile, saving is refused.
  const [expected, setExpected] = useState(item.quantity)
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState<AdjustReason | null>(null)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [changedTo, setChangedTo] = useState<number | null>(null)

  const countedValid = /^\d+$/.test(counted.trim()) && Number(counted) <= STOCK_LIMITS.maxQuantity
  const countedNumber = countedValid ? Number(counted) : null
  const difference = countedNumber === null ? null : describeAdjustment(expected, countedNumber)
  const noteMissing = reason === 'other' && note.trim() === ''

  const askToSave = () => {
    setShowErrors(true)
    if (countedNumber === null || difference === null || reason === null || noteMissing) return
    setConfirming(true)
  }

  const save = async () => {
    if (countedNumber === null || reason === null) return
    setError(null)
    try {
      await adjust.mutateAsync({
        itemId: item.id,
        countedQuantity: countedNumber,
        expectedQuantity: expected,
        reason,
        note,
      })
      setConfirming(false)
      toast({
        title: 'Stock adjusted',
        description: `${item.name}: now ${countedNumber}.`,
        tone: 'success',
      })
      await navigate(`/owner/items/${item.id}`)
    } catch (thrown) {
      setConfirming(false)
      const appError = toAppError(thrown)
      const now = appError.details?.quantity
      if (appError.code === 'conflict' && typeof now === 'number') setChangedTo(now)
      else setError(appError)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {changedTo !== null ? (
        <Banner
          tone="error"
          title={`Stock changed while you were counting. It's now ${changedTo}.`}
          description="A sale or a delivery happened meanwhile. Check your count against the new number, then save again."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setExpected(changedTo)
                setChangedTo(null)
              }}
            >
              Use the new number
            </Button>
          }
        />
      ) : null}
      <ErrorBanner error={error} />

      <div className="rounded-card border border-line bg-surface-raised p-4 shadow-soft">
        <p className="text-label font-normal text-ink-muted">Tallybox says you have</p>
        <p className="text-display text-ink tabular-nums">{expected}</p>
      </div>

      <TextField
        label="What you counted"
        inputMode="numeric"
        autoComplete="off"
        value={counted}
        onChange={(event) => setCounted(event.target.value)}
        error={
          showErrors && countedNumber === null
            ? 'Enter the number you counted, a whole number.'
            : showErrors && difference === null
              ? 'That is the same as now: nothing to adjust.'
              : undefined
        }
      />
      <p aria-live="polite" className="min-h-6 text-body-lg font-semibold text-ink">
        {difference ? `Difference: ${difference}` : ''}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-label text-ink">Reason</legend>
        <FilterChips
          label="Reason"
          options={ADJUST_REASONS}
          value={reason ?? ('' as AdjustReason)}
          onChange={setReason}
        />
        {showErrors && reason === null ? (
          <p className="text-label font-medium text-error-strong">Choose a reason.</p>
        ) : null}
      </fieldset>

      <TextField
        label="Note"
        autoComplete="off"
        maxLength={STOCK_LIMITS.noteMax}
        hint={reason === 'other' ? 'Required: say what happened.' : 'Optional. Say what happened.'}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        error={showErrors && noteMissing ? 'Add a few words about what happened.' : undefined}
      />

      <Button size="lg" fullWidth onClick={askToSave} disabled={!online}>
        Save adjustment
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Adjust ${item.name}?`}
        description={`${difference ?? ''}. Reason: ${reason ? adjustReasonLabel(reason).toLowerCase() : ''}. This is recorded permanently in the stock ledger.`}
        confirmLabel="Save adjustment"
        loading={adjust.isPending}
        onConfirm={() => void save()}
      />
    </div>
  )
}

/** Sets an item's stock to what was actually counted, with a reason. */
export default function AdjustStockPage() {
  const { itemId = '' } = useParams()
  const items = useItems()
  const item = items.data?.find((candidate) => candidate.id === itemId)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <BackLink to={`/owner/items/${itemId}`} label="Item" />
      <header className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">Adjust stock</h1>
        {item ? <p className="text-body break-words text-ink-muted">{item.name}</p> : null}
      </header>
      {items.isPending ? (
        <Skeleton className="h-48 w-full rounded-card" />
      ) : items.isError || !item ? (
        <ErrorState error={items.error ?? new AppError('not_found')} />
      ) : (
        <AdjustForm item={item} />
      )}
    </div>
  )
}
