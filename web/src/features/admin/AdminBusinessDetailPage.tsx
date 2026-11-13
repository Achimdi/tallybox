import { CalendarPlus, Copy, KeyRound, MessageCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { LIMITS } from '@/domain/rules'
import { extendAccessEnd } from '@/domain/access'
import { Banner, ErrorBanner } from '@/components/Banner'
import { BackLink } from '@/components/BackLink'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/Button'
import { buttonClasses } from '@/components/button-styles'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/TextField'
import { useToast } from '@/components/toast-context'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/dates'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import {
  accessChip,
  formatDay,
  MY_TIMEZONE,
  resolveAccessChoice,
  type AccessChoice,
} from './access'
import { AccessLengthPicker } from './AccessLengthPicker'
import { useAdminBusiness, useExtendAccess, useOwnerResetLink, useSetBusinessStatus } from './api'
import { whatsAppShareUrl } from './whatsapp'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-normal text-ink-muted">{label}</dt>
      <dd className="text-body break-words text-ink">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-5 shadow-soft">
      <h2 className="text-title text-ink">{title}</h2>
      {children}
    </section>
  )
}

/** Developer portal: one business, with suspend, reactivate, extend access and a reset link. */
export default function AdminBusinessDetailPage() {
  const { businessId = '' } = useParams()
  const toast = useToast()
  const online = useOnlineStatus()
  const business = useAdminBusiness(businessId)
  const setStatus = useSetBusinessStatus()
  const extend = useExtendAccess()
  const resetLink = useOwnerResetLink()

  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState<'suspend' | 'reactivate' | null>(null)

  const [extendOpen, setExtendOpen] = useState(false)
  const [choice, setChoice] = useState<AccessChoice>('30')
  const [customDays, setCustomDays] = useState('')

  if (business.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <span className="sr-only">Loading business</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (business.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/admin/businesses" label="Businesses" />
        <ErrorState
          headingLevel={1}
          error={business.error}
          onRetry={() => void business.refetch()}
        />
      </div>
    )
  }

  const data = business.data
  const access = accessChip(data)
  const extendDays = resolveAccessChoice(choice, customDays)
  const newEnd =
    extendDays === undefined
      ? undefined
      : extendAccessEnd(data.accessEndsAt, extendDays, new Date())

  const askToSuspend = () => {
    if (reason.trim().length === 0) {
      setReasonError('Say why, so there is a record.')
      return
    }
    setReasonError(undefined)
    setConfirming('suspend')
  }

  const applyStatus = () => {
    if (!confirming) return
    const suspending = confirming === 'suspend'
    setStatus.mutate(
      {
        businessId: data.id,
        status: suspending ? 'suspended' : 'active',
        ...(suspending ? { reason: reason.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast({
            title: suspending ? `${data.name} suspended` : `${data.name} reactivated`,
            tone: 'success',
          })
          setReason('')
        },
        onSettled: () => setConfirming(null),
      },
    )
  }

  const applyExtend = () => {
    if (extendDays === undefined) return
    extend.mutate(
      { businessId: data.id, days: extendDays },
      {
        onSuccess: (result) => {
          setExtendOpen(false)
          toast({
            title: 'Access extended',
            description: result.accessEndsAt
              ? `Now ends on ${formatDay(result.accessEndsAt)}.`
              : 'Access is now open-ended.',
            tone: 'success',
          })
        },
      },
    )
  }

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast({ title: 'Link copied', tone: 'success' })
    } catch {
      toast({
        title: "Couldn't copy",
        description: 'Select the link and copy it by hand.',
        tone: 'error',
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/admin/businesses" label="Businesses" />

      <header className="flex flex-col gap-2">
        <h1 className="text-title-lg text-ink">{data.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-ink-muted">{data.businessCode}</span>
          <StatusChip status={data.status} />
          <StatusChip status={access.status} label={access.label} />
        </div>
      </header>

      <Section title="Overview">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Owner">
            {data.ownerName ?? 'No owner'}
            {data.ownerEmail ? (
              <span className="block text-ink-muted">{data.ownerEmail}</span>
            ) : null}
          </Detail>
          <Detail label="Staff accounts">
            {data.activeStaffCount} active of {data.staffCount}
          </Detail>
          <Detail label="Orders">
            {data.orderCount} in total, {data.orderCountToday} today
          </Detail>
          <Detail label="Last sign-in">
            {data.lastActivityAt
              ? formatDateTime(new Date(data.lastActivityAt), MY_TIMEZONE)
              : 'Never'}
          </Detail>
          <Detail label="Registered">{formatDay(data.createdAt)}</Detail>
          <Detail label="Access ends">
            {data.accessEndsAt ? formatDay(data.accessEndsAt) : 'Open-ended (no end date)'}
          </Detail>
          {data.status === 'suspended' ? (
            <>
              <Detail label="Suspended">
                {data.suspendedAt ? formatDay(data.suspendedAt) : ''}
              </Detail>
              <Detail label="Reason">{data.suspendedReason ?? ''}</Detail>
            </>
          ) : null}
        </dl>
      </Section>

      <Section title="Access period">
        <p className="text-body text-ink-muted">
          {data.accessEndsAt
            ? `Access ends on ${formatDay(data.accessEndsAt)}. After a 3-day grace period the business is locked until access is extended. Nothing is deleted.`
            : 'This business has open-ended access.'}
        </p>
        <div>
          <Button
            onClick={() => {
              extend.reset()
              setExtendOpen(true)
            }}
            disabled={!online}
            leadingIcon={<CalendarPlus aria-hidden="true" className="size-5" />}
          >
            Extend access
          </Button>
        </div>
      </Section>

      <Section title={data.status === 'active' ? 'Suspend business' : 'Business is suspended'}>
        <ErrorBanner error={setStatus.error} />
        {data.status === 'active' ? (
          <>
            <TextField
              label="Reason for suspending"
              value={reason}
              maxLength={LIMITS.reasonMax}
              onChange={(event) => setReason(event.target.value)}
              hint="Only you see this. Everyone in the business is locked out until you reactivate it."
              error={reasonError}
            />
            <div>
              <Button variant="danger" onClick={askToSuspend} disabled={!online}>
                Suspend business
              </Button>
            </div>
          </>
        ) : (
          <div>
            <Button onClick={() => setConfirming('reactivate')} disabled={!online}>
              Reactivate business
            </Button>
          </div>
        )}
      </Section>

      <Section title="Owner password reset">
        <p className="text-body text-ink-muted">
          For an owner who forgot their password. Check it&apos;s really them first, then send the
          one-time link by WhatsApp.
        </p>
        <ErrorBanner error={resetLink.error} />
        {resetLink.data ? (
          <div className="flex flex-col gap-3">
            {resetLink.data.simulated ? (
              <Banner
                tone="info"
                title="Simulated in demo mode"
                description="This link resets nothing. In the live app it is a real one-time link."
              />
            ) : null}
            <p className="text-body break-all text-ink select-all">{resetLink.data.url}</p>
            <p className="text-label font-normal text-ink-muted">
              For {resetLink.data.ownerEmail}. Works once, until{' '}
              {formatDateTime(new Date(resetLink.data.expiresAt), MY_TIMEZONE)}.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="secondary"
                onClick={() => void copyLink(resetLink.data.url)}
                leadingIcon={<Copy aria-hidden="true" className="size-5" />}
              >
                Copy link
              </Button>
              <a
                href={whatsAppShareUrl(
                  `Here is your Tallybox password reset link. It works once: ${resetLink.data.url}`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonClasses({ variant: 'secondary' }), 'hover:bg-surface-sunken')}
              >
                <MessageCircle aria-hidden="true" className="size-5" />
                <span>Share on WhatsApp</span>
              </a>
            </div>
          </div>
        ) : (
          <div>
            <Button
              variant="secondary"
              onClick={() => resetLink.mutate(data.id)}
              loading={resetLink.isPending}
              disabled={!online || !data.ownerEmail}
              leadingIcon={<KeyRound aria-hidden="true" className="size-5" />}
            >
              Create reset link
            </Button>
          </div>
        )}
      </Section>

      <BottomSheet
        open={extendOpen}
        onOpenChange={setExtendOpen}
        title="Extend access"
        description={data.name}
      >
        <div className="flex flex-col gap-4">
          <AccessLengthPicker
            label="Add"
            hint="Days are added from today or the current end date, whichever is later."
            choice={choice}
            customDays={customDays}
            onChoiceChange={setChoice}
            onCustomDaysChange={setCustomDays}
            customError={
              choice === 'custom' && customDays !== '' && extendDays === undefined
                ? 'Enter a whole number of days from 1 to 3650.'
                : undefined
            }
          />
          <p className="text-body text-ink" aria-live="polite">
            {newEnd === undefined
              ? ' '
              : newEnd === null
                ? 'New end date: none (open-ended)'
                : `New end date: ${formatDay(newEnd)}`}
          </p>
          <ErrorBanner error={extend.error} />
          <Button
            fullWidth
            onClick={applyExtend}
            loading={extend.isPending}
            disabled={!online || extendDays === undefined}
          >
            Save
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirming(null)
        }}
        title={confirming === 'suspend' ? `Suspend ${data.name}?` : `Reactivate ${data.name}?`}
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
