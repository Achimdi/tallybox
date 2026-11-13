import { Ban, CalendarX, UserX, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/Button'
import { SUPPORT_EMAIL } from '@/lib/config'
import { formatDate } from '@/lib/dates'
import { useSession, type BlockedNotice, type BlockedReason } from './session'

interface Wording {
  icon: LucideIcon
  title: (notice: BlockedNotice) => string
  description: (notice: BlockedNotice) => string
  /** Suspension and ended access are for Tallybox to fix. A turned-off account is for the owner. */
  contactSupport: boolean
}

const MY_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const WORDING: Record<BlockedReason, Wording> = {
  suspended: {
    icon: Ban,
    title: ({ businessName }) =>
      businessName ? `${businessName} is suspended` : 'This business is suspended',
    description: () =>
      'Nobody in the business can use Tallybox for now. Your records are safe and nothing has been deleted. Contact support to get it reactivated.',
    contactSupport: true,
  },
  access_ended: {
    icon: CalendarX,
    title: ({ businessName }) =>
      businessName ? `${businessName}'s access has ended` : "This business's access has ended",
    description: ({ accessEndedAt }) =>
      `${accessEndedAt ? `Access ended on ${formatDate(new Date(accessEndedAt), MY_TIMEZONE)}. ` : ''}Your records are safe and nothing has been deleted. Contact support to extend access.`,
    contactSupport: true,
  },
  disabled: {
    icon: UserX,
    title: () => 'This account is turned off',
    description: () => 'The business owner turned this account off. Ask them to turn it back on.',
    contactSupport: false,
  },
  no_profile: {
    icon: UserX,
    title: () => "This account isn't linked to a business",
    description: () => 'Contact support and we will sort it out.',
    contactSupport: true,
  },
}

interface BlockedPageProps {
  /** What to show if the page is opened directly, with no notice. */
  fallbackReason: 'suspended' | 'access_ended'
}

/**
 * Shown, after signing the person out, when their business is suspended, its
 * access has ended, or their account is turned off. Serves /suspended and
 * /access-ended.
 */
export default function SuspendedPage({ fallbackReason }: BlockedPageProps) {
  const { blocked, clearBlocked } = useSession()
  const navigate = useNavigate()
  const notice: BlockedNotice = blocked ?? {
    reason: fallbackReason,
    businessName: null,
    accessEndedAt: null,
  }
  const wording = WORDING[notice.reason]
  const Icon = wording.icon

  const backToStart = () => {
    clearBlocked()
    void navigate('/', { replace: true })
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-error-soft text-error-strong">
        <Icon aria-hidden="true" className="size-8" />
      </span>
      <h1 className="text-title-lg text-ink">{wording.title(notice)}</h1>
      <p className="max-w-sm text-body text-ink-muted">{wording.description(notice)}</p>
      {wording.contactSupport ? (
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex min-h-12 items-center text-body font-semibold text-primary underline"
        >
          {SUPPORT_EMAIL}
        </a>
      ) : null}
      <Button variant="secondary" onClick={backToStart}>
        Back to start
      </Button>
    </div>
  )
}
