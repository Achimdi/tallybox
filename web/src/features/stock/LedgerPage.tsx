import { useState } from 'react'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/Button'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { MOVEMENT_TYPES, type MovementType } from '@/domain/stock'
import { useSessionUser } from '@/features/auth/session'
import { useItems } from '@/features/items/api'
import { useStaffList } from '@/features/staff/api'
import { addDays, dateKey } from '@/lib/dates'
import { useMovements } from './api'
import { MovementList } from './MovementList'

/** Every stock change in the business, permanent and filterable. */
export default function LedgerPage() {
  const user = useSessionUser()
  const today = dateKey(new Date(), user.timezone ?? 'UTC')
  const items = useItems()
  const staff = useStaffList()
  const [itemId, setItemId] = useState('')
  const [type, setType] = useState<MovementType | ''>('')
  const [userId, setUserId] = useState('')
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)

  const movements = useMovements({
    ...(itemId ? { itemId } : {}),
    ...(type ? { type } : {}),
    ...(userId ? { userId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  })

  const filtered =
    itemId !== '' || type !== '' || userId !== '' || from !== addDays(today, -6) || to !== today

  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/owner/more" label="More" />
      <header className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">Stock ledger</h1>
        <p className="text-body text-ink-muted">
          Every change to stock, with who made it. Entries can never be edited or deleted.
        </p>
      </header>

      <section
        aria-label="Filters"
        className="grid grid-cols-1 gap-3 rounded-card border border-line bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <SelectField
          label="Item"
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
          options={[
            { value: '', label: 'All items' },
            ...(items.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <SelectField
          label="Type"
          value={type}
          onChange={(event) => setType(event.target.value as MovementType | '')}
          options={[{ value: '', label: 'All types' }, ...MOVEMENT_TYPES]}
        />
        <SelectField
          label="Person"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          options={[
            { value: '', label: 'Everyone' },
            { value: user.id, label: `${user.displayName} (you)` },
            ...(staff.data ?? []).map((member) => ({
              value: member.id,
              label: member.displayName,
            })),
          ]}
        />
        <TextField
          label="From"
          type="date"
          max={to || today}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <TextField
          label="To"
          type="date"
          min={from}
          max={today}
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        {filtered ? (
          <div className="sm:col-span-2 lg:col-span-5">
            <Button
              variant="ghost"
              onClick={() => {
                setItemId('')
                setType('')
                setUserId('')
                setFrom(addDays(today, -6))
                setTo(today)
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </section>

      <MovementList movements={movements} showItem emptyTitle="No stock changes match" />
    </div>
  )
}
