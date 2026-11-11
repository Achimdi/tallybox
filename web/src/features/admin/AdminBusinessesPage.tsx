import { LIMITS } from '@shared/rules'
import { Ban, KeyRound, Store, Users } from 'lucide-react'
import { useState } from 'react'
import { ErrorBanner } from '@/components/Banner'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SectionHeader } from '@/components/SectionHeader'
import { SkeletonList } from '@/components/Skeleton'
import { StatCard } from '@/components/StatCard'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { formatDate, formatDateTime } from '@/lib/dates'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import {
  useAdminBusinesses,
  usePlatformCounts,
  useSetBusinessStatus,
  type AdminBusiness,
} from './api'

// The super-admin sees times in their own timezone.
const MY_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

function when(iso: string | null): string {
  return iso ? formatDateTime(new Date(iso), MY_TIMEZONE) : 'Never'
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-normal text-ink-muted">{label}</dt>
      <dd className="text-body break-words text-ink">{value}</dd>
    </div>
  )
}

/** Super-admin: every business, with suspend and reactivate. */
export default function AdminBusinessesPage() {
  const toast = useToast()
  const online = useOnlineStatus()
  const businesses = useAdminBusinesses()
  const counts = usePlatformCounts()
  const setStatus = useSetBusinessStatus()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState<'suspend' | 'reactivate' | null>(null)

  // Looked up from the fresh list each time, so the sheet shows the latest status.
  const selected: AdminBusiness | undefined = businesses.data?.find(
    (business) => business.id === selectedId,
  )

  const open = (business: AdminBusiness) => {
    setSelectedId(business.id)
    setReason('')
    setReasonError(undefined)
    setStatus.reset()
  }

  const askToSuspend = () => {
    if (reason.trim().length === 0) {
      setReasonError('Say why, so there is a record.')
      return
    }
    setReasonError(undefined)
    setConfirming('suspend')
  }

  const applyStatus = () => {
    if (!selected || !confirming) return
    const suspending = confirming === 'suspend'
    setStatus.mutate(
      {
        businessId: selected.id,
        status: suspending ? 'suspended' : 'active',
        ...(suspending ? { reason: reason.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast({
            title: suspending ? `${selected.name} suspended` : `${selected.name} reactivated`,
            tone: 'success',
          })
          setReason('')
        },
        onSettled: () => setConfirming(null),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title-lg text-ink">Businesses</h1>

      <section aria-label="Platform counts" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Businesses" icon={Store} value={counts.data?.businesses ?? '–'} />
        <StatCard label="Suspended" icon={Ban} value={counts.data?.suspended ?? '–'} />
        <StatCard label="Staff accounts" icon={Users} value={counts.data?.staff ?? '–'} />
        <StatCard label="Unused codes" icon={KeyRound} value={counts.data?.unused_codes ?? '–'} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="All businesses" />
        {businesses.isPending ? (
          <SkeletonList rows={4} label="Loading businesses" />
        ) : businesses.isError ? (
          <div className="rounded-card border border-line bg-surface-raised">
            <ErrorState error={businesses.error} onRetry={() => void businesses.refetch()} />
          </div>
        ) : businesses.data.length === 0 ? (
          <div className="rounded-card border border-line bg-surface-raised">
            <EmptyState
              title="No businesses yet"
              description="Generate an activation code and send it to your first client."
            />
          </div>
        ) : (
          <ListGroup>
            {businesses.data.map((business) => (
              <ListItem
                key={business.id}
                onClick={() => open(business)}
                title={business.name}
                subtitle={`${business.business_code} · ${business.owner_email ?? 'no owner'} · since ${formatDate(new Date(business.created_at), MY_TIMEZONE)}`}
                trailing={<StatusChip status={business.status} />}
              />
            ))}
          </ListGroup>
        )}
      </section>

      <BottomSheet
        open={selected !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedId(null)
        }}
        title={selected?.name ?? ''}
        description={selected?.business_code ?? ''}
      >
        {selected ? (
          <div className="flex flex-col gap-5">
            <div>
              <StatusChip status={selected.status} />
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Owner" value={selected.owner_email ?? 'No owner'} />
              <Detail label="Staff accounts" value={String(selected.staff_count)} />
              <Detail
                label="Registered"
                value={formatDate(new Date(selected.created_at), MY_TIMEZONE)}
              />
              <Detail label="Last sign-in" value={when(selected.last_activity_at)} />
              {selected.status === 'suspended' ? (
                <>
                  <Detail label="Suspended" value={when(selected.suspended_at)} />
                  <Detail label="Reason" value={selected.suspended_reason ?? ''} />
                </>
              ) : null}
            </dl>

            <ErrorBanner error={setStatus.error} />

            {selected.status === 'active' ? (
              <div className="flex flex-col gap-3">
                <TextField
                  label="Reason for suspending"
                  value={reason}
                  maxLength={LIMITS.reasonMax}
                  onChange={(event) => setReason(event.target.value)}
                  hint="Only you see this. Nobody in the business can use Tallybox while it is suspended."
                  error={reasonError}
                />
                <Button variant="danger" onClick={askToSuspend} disabled={!online}>
                  Suspend business
                </Button>
              </div>
            ) : (
              <Button onClick={() => setConfirming('reactivate')} disabled={!online}>
                Reactivate business
              </Button>
            )}
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirming(null)
        }}
        title={
          confirming === 'suspend'
            ? `Suspend ${selected?.name ?? 'this business'}?`
            : `Reactivate ${selected?.name ?? 'this business'}?`
        }
        description={
          confirming === 'suspend'
            ? 'Everyone in the business is signed out and locked out straight away. Their records are kept, and you can reactivate at any time.'
            : 'The owner and staff can sign in again straight away.'
        }
        confirmLabel={confirming === 'suspend' ? 'Suspend' : 'Reactivate'}
        tone={confirming === 'suspend' ? 'danger' : 'default'}
        loading={setStatus.isPending}
        onConfirm={applyStatus}
      />
    </div>
  )
}
