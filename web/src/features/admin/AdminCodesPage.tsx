import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { AdminActivationCode } from '@/api/types'
import { Button, ButtonLink } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FilterChips } from '@/components/FilterChips'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { useToast } from '@/components/toast-context'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { accessLengthLabel, formatDay } from './access'
import { useAdminActivationCodes, useRevokeActivationCode } from './api'

type Filter = 'all' | AdminActivationCode['status']

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unused', label: 'Unused' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
]

function codeSubtitle(code: AdminActivationCode): string {
  const parts: string[] = []
  if (code.note) parts.push(code.note)
  if (code.status === 'used') {
    parts.push(
      code.usedByBusinessName
        ? `Used by ${code.usedByBusinessName}${code.usedAt ? ` on ${formatDay(code.usedAt)}` : ''}`
        : 'Used',
    )
  } else if (code.status === 'expired') {
    parts.push(`Expired ${formatDay(code.redeemBy)}`)
  } else if (code.status === 'unused') {
    parts.push(`Redeem by ${formatDay(code.redeemBy)}`)
  }
  parts.push(`Access: ${accessLengthLabel(code.accessDays)}`)
  return parts.join(' · ')
}

/** Developer portal: every activation code and its status. */
export default function AdminCodesPage() {
  const toast = useToast()
  const online = useOnlineStatus()
  const codes = useAdminActivationCodes()
  const revoke = useRevokeActivationCode()
  const [filter, setFilter] = useState<Filter>('all')
  const [toRevoke, setToRevoke] = useState<AdminActivationCode | null>(null)

  const options = FILTERS.map((option) => ({
    ...option,
    ...(codes.data
      ? {
          count:
            option.value === 'all'
              ? codes.data.length
              : codes.data.filter((code) => code.status === option.value).length,
        }
      : {}),
  }))
  const shown = (codes.data ?? []).filter((code) => filter === 'all' || code.status === filter)

  const confirmRevoke = () => {
    if (!toRevoke) return
    revoke.mutate(toRevoke.id, {
      onSuccess: () => toast({ title: 'Code revoked', tone: 'success' }),
      onError: () =>
        toast({
          title: "Couldn't revoke that code",
          description: 'It may have just been used. The list has been refreshed.',
          tone: 'error',
        }),
      onSettled: () => setToRevoke(null),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title-lg text-ink">Activation codes</h1>
        <ButtonLink
          to="/admin/codes/new"
          leadingIcon={<Plus aria-hidden="true" className="size-5" />}
        >
          Generate code
        </ButtonLink>
      </header>

      <FilterChips label="Filter codes" options={options} value={filter} onChange={setFilter} />

      {codes.isPending ? (
        <SkeletonList rows={4} label="Loading codes" />
      ) : codes.isError ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <ErrorState error={codes.error} onRetry={() => void codes.refetch()} />
        </div>
      ) : codes.data.length === 0 ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <EmptyState
            title="No codes yet"
            description="Generate one for each new business."
            action={<ButtonLink to="/admin/codes/new">Generate code</ButtonLink>}
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface-raised">
          <EmptyState
            title="No codes match"
            action={
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Show all codes
              </Button>
            }
          />
        </div>
      ) : (
        <ListGroup>
          {shown.map((code) => (
            <ListItem
              key={code.id}
              wrap
              title={code.ownerEmail}
              subtitle={codeSubtitle(code)}
              trailing={
                <>
                  <StatusChip status={code.status} />
                  {code.status === 'unused' ? (
                    <Button variant="ghost" onClick={() => setToRevoke(code)} disabled={!online}>
                      Revoke
                    </Button>
                  ) : null}
                </>
              }
            />
          ))}
        </ListGroup>
      )}

      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setToRevoke(null)
        }}
        title="Revoke this code?"
        description={`The code for ${toRevoke?.ownerEmail ?? 'this owner'} will stop working. You can generate a new one at any time.`}
        confirmLabel="Revoke code"
        tone="danger"
        loading={revoke.isPending}
        onConfirm={confirmRevoke}
      />
    </div>
  )
}
