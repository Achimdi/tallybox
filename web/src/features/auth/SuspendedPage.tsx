import { Ban, UserX } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/Button'
import { SUPPORT_EMAIL } from '@/lib/config'
import { useSession, type BlockedReason } from './session'

interface Wording {
  title: (businessName: string | null) => string
  description: string
  /** Suspended and lapsed are for Tallybox to fix. A turned-off account is for the owner. */
  contactSupport: boolean
}

const WORDING: Record<BlockedReason, Wording> = {
  suspended: {
    title: (name) => (name ? `${name} is suspended` : 'This business is suspended'),
    description:
      'Nobody in the business can use Tallybox for now. Your records are safe and nothing has been deleted. Contact support to get it reactivated.',
    contactSupport: true,
  },
  // Reserved for later, when subscriptions exist. Kept separate from "suspended" on purpose.
  lapsed: {
    title: (name) => (name ? `${name}'s subscription has ended` : 'The subscription has ended'),
    description: 'Your records are safe. Contact support to renew and carry on.',
    contactSupport: true,
  },
  disabled: {
    title: () => 'This account is turned off',
    description: 'The business owner turned this account off. Ask them to turn it back on.',
    contactSupport: false,
  },
  no_profile: {
    title: () => "This account isn't linked to a business",
    description: 'Contact support and we will sort it out.',
    contactSupport: true,
  },
}

/** Shown after sign-out when a business is suspended or an account is turned off. */
export default function SuspendedPage() {
  const { blocked, clearBlocked } = useSession()
  const navigate = useNavigate()
  const reason = blocked?.reason ?? 'suspended'
  const wording = WORDING[reason]
  const Icon = reason === 'disabled' ? UserX : Ban

  const backToStart = () => {
    clearBlocked()
    void navigate('/', { replace: true })
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-error-soft text-error-strong">
        <Icon aria-hidden="true" className="size-8" />
      </span>
      <h1 className="text-title-lg text-ink">{wording.title(blocked?.businessName ?? null)}</h1>
      <p className="max-w-sm text-body text-ink-muted">{wording.description}</p>
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
