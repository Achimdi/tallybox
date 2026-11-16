import { Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import type { Supply } from '@/api/types'
import { Button } from '@/components/Button'
import { CheckboxField } from '@/components/CheckboxField'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { SUPPLY_LIMITS } from '@/domain/supplies'

export interface SupplyDraft {
  /** A stable key for the row while editing. */
  key: string
  supplyId: string
  unitsPerSale: string
}

export interface StockModeDraft {
  tracksOwnStock: boolean
  usesSupplies: boolean
  supplies: SupplyDraft[]
}

/** Problems with the draft, by field, or an empty object when it can be saved. */
export function stockModeProblems(draft: StockModeDraft): {
  supplies?: string
  rows: Record<string, string>
} {
  const rows: Record<string, string> = {}
  if (!draft.usesSupplies) return { rows }
  if (draft.supplies.length === 0) return { supplies: 'Choose at least one supply.', rows }
  const seen = new Set<string>()
  for (const row of draft.supplies) {
    if (!row.supplyId) rows[row.key] = 'Choose a supply.'
    else if (seen.has(row.supplyId)) rows[row.key] = 'This supply is already listed.'
    else if (
      !/^\d+$/.test(row.unitsPerSale.trim()) ||
      Number(row.unitsPerSale) < 1 ||
      Number(row.unitsPerSale) > SUPPLY_LIMITS.maxUnitsPerSale
    ) {
      rows[row.key] = 'Enter a whole number of at least 1.'
    }
    seen.add(row.supplyId)
  }
  return { rows }
}

interface StockModeFieldsProps {
  draft: StockModeDraft
  onChange: (draft: StockModeDraft) => void
  /** Supplies that can be chosen (not archived). */
  supplies: readonly Supply[]
  showErrors: boolean
  /** Editing an existing item: the change applies to new sales only. */
  editing: boolean
  changed: boolean
}

/**
 * How an item's stock is counted: its own stock, shared supplies (like bottles
 * used by several drinks), both, or neither. The two choices are independent.
 */
export function StockModeFields({
  draft,
  onChange,
  supplies,
  showErrors,
  editing,
  changed,
}: StockModeFieldsProps) {
  const problems = stockModeProblems(draft)
  const set = (change: Partial<StockModeDraft>) => onChange({ ...draft, ...change })
  const setRow = (key: string, change: Partial<SupplyDraft>) =>
    set({ supplies: draft.supplies.map((row) => (row.key === key ? { ...row, ...change } : row)) })
  const options = [
    { value: '', label: 'Choose a supply' },
    ...supplies.map((supply) => ({
      value: supply.id,
      label: `${supply.name} (${supply.quantity} left)`,
    })),
  ]

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-label text-ink">How is stock counted?</legend>
      <CheckboxField
        label="Count this item's own stock"
        description="It has its own quantity, restocked and adjusted like any item."
        checked={draft.tracksOwnStock}
        onChange={(tracksOwnStock) => set({ tracksOwnStock })}
      />
      <CheckboxField
        label="Use shared supplies"
        description="Each one sold also uses supplies shared with other items, like a bottle and a cap."
        checked={draft.usesSupplies}
        onChange={(usesSupplies) =>
          set({
            usesSupplies,
            supplies:
              usesSupplies && draft.supplies.length === 0
                ? [{ key: crypto.randomUUID(), supplyId: '', unitsPerSale: '1' }]
                : draft.supplies,
          })
        }
      />

      {draft.usesSupplies ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-sunken p-3">
          {supplies.length === 0 ? (
            <p className="text-body text-ink-muted">
              No supplies yet.{' '}
              <Link to="/owner/supplies/new" className="font-semibold text-primary underline">
                Add a supply
              </Link>{' '}
              first, for example &ldquo;300 ml bottle&rdquo;.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {draft.supplies.map((row, index) => (
                  <li
                    key={row.key}
                    className="flex flex-col gap-2 rounded-control bg-surface-raised p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
                      <SelectField
                        label={`Supply ${index + 1}`}
                        value={row.supplyId}
                        onChange={(event) => setRow(row.key, { supplyId: event.target.value })}
                        options={options}
                      />
                      <TextField
                        label="Used per sale"
                        inputMode="numeric"
                        autoComplete="off"
                        value={row.unitsPerSale}
                        onChange={(event) => setRow(row.key, { unitsPerSale: event.target.value })}
                      />
                    </div>
                    {showErrors && problems.rows[row.key] ? (
                      <p className="text-label font-medium text-error-strong">
                        {problems.rows[row.key]}
                      </p>
                    ) : null}
                    <Button
                      variant="ghost"
                      className="self-start"
                      onClick={() =>
                        set({ supplies: draft.supplies.filter((entry) => entry.key !== row.key) })
                      }
                      leadingIcon={<Trash2 aria-hidden="true" className="size-5" />}
                      aria-label={`Remove supply ${index + 1}`}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              {draft.supplies.length < Math.min(SUPPLY_LIMITS.maxPerItem, supplies.length) ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    set({
                      supplies: [
                        ...draft.supplies,
                        { key: crypto.randomUUID(), supplyId: '', unitsPerSale: '1' },
                      ],
                    })
                  }
                  leadingIcon={<Plus aria-hidden="true" className="size-5" />}
                >
                  Add another supply
                </Button>
              ) : null}
            </>
          )}
          {showErrors && problems.supplies ? (
            <p className="text-label font-medium text-error-strong">{problems.supplies}</p>
          ) : null}
        </div>
      ) : null}

      {!draft.tracksOwnStock && !draft.usesSupplies ? (
        <p className="text-label font-normal text-ink-muted">
          Stock isn&apos;t counted: it can always be sold. Good for food made to order.
        </p>
      ) : null}
      {editing && changed ? (
        <p className="text-label font-normal text-ink-muted">
          This changes new sales only. Past orders keep what they used, and the change is recorded.
        </p>
      ) : null}
    </fieldset>
  )
}
