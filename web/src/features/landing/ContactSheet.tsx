import { Copy, ExternalLink, Mail } from 'lucide-react'
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'
import { BottomSheet } from '@/components/BottomSheet'
import { buttonClasses } from '@/components/button-styles'
import { useToast } from '@/components/toast-context'
import { SUPPORT_EMAIL } from '@/lib/config'

/**
 * Getting in touch from the front page.
 *
 * A plain mailto: link does nothing on a computer with no email program set
 * up (common for people who use Gmail in the browser), so every contact link
 * here opens this panel instead: the address with a Copy button, a ready
 * Gmail message in a new tab, and the email app for phones and computers that
 * have one.
 */

export type ContactReason = 'code' | 'contact'

const COPY: Record<ContactReason, { title: string; description: string; subject: string }> = {
  code: {
    title: 'Ask for an activation code',
    description:
      'Email us your business name and your name. We reply with a single-use code and agree how long your access lasts.',
    subject: 'Tallybox activation code',
  },
  contact: {
    title: 'Contact Tallybox',
    description: 'Questions, help or an activation code: write to us and we will get back to you.',
    subject: 'Tallybox',
  },
}

const BODY: Record<ContactReason, string> = {
  code: 'Business name:\nYour name:\nPhone (optional):\n',
  contact: '',
}

export function mailtoLink(reason: ContactReason): string {
  const params = new URLSearchParams({ subject: COPY[reason].subject })
  if (BODY[reason]) params.set('body', BODY[reason])
  // mailto wants %20 for spaces, not "+".
  return `mailto:${SUPPORT_EMAIL}?${params.toString().replaceAll('+', '%20')}`
}

export function gmailLink(reason: ContactReason): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: SUPPORT_EMAIL,
    su: COPY[reason].subject,
  })
  if (BODY[reason]) params.set('body', BODY[reason])
  return `https://mail.google.com/mail/?${params.toString()}`
}

const ContactContext = createContext<(reason: ContactReason) => void>(() => undefined)

/** Wraps the front page: provides the contact panel to every ContactLink inside. */
export function ContactProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<ContactReason | null>(null)
  const [shown, setShown] = useState<ContactReason>('code')
  const open = useCallback((next: ContactReason) => {
    setShown(next)
    setReason(next)
  }, [])

  return (
    <ContactContext value={open}>
      {children}
      <ContactSheet
        reason={shown}
        open={reason !== null}
        onOpenChange={(next) => {
          if (!next) setReason(null)
        }}
      />
    </ContactContext>
  )
}

/** A link-styled button (or anything else) that opens the contact panel. */
export function ContactLink({
  reason,
  className,
  children,
}: {
  reason: ContactReason
  className?: string
  children: ReactNode
}) {
  const open = use(ContactContext)
  return (
    <button type="button" className={className} onClick={() => open(reason)}>
      {children}
    </button>
  )
}

function ContactSheet({
  reason,
  open,
  onOpenChange,
}: {
  reason: ContactReason
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const text = COPY[reason]
  const links = useMemo(() => ({ gmail: gmailLink(reason), mailto: mailtoLink(reason) }), [reason])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      toast({ title: 'Email address copied', tone: 'success' })
    } catch {
      toast({
        title: "Couldn't copy it",
        description: `The address is ${SUPPORT_EMAIL}`,
        tone: 'error',
      })
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={text.title}
      description={text.description}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-sunken p-3">
          <span className="min-w-0 text-body font-semibold break-all text-ink">
            {SUPPORT_EMAIL}
          </span>
          <button
            type="button"
            onClick={() => void copy()}
            className={buttonClasses({ variant: 'secondary', size: 'md' })}
          >
            <Copy aria-hidden="true" className="size-5" />
            Copy
          </button>
        </div>
        <a
          href={links.gmail}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ size: 'lg', fullWidth: true })}
        >
          <ExternalLink aria-hidden="true" className="size-5" />
          Write in Gmail
        </a>
        <a
          href={links.mailto}
          className={buttonClasses({ variant: 'secondary', size: 'lg', fullWidth: true })}
        >
          <Mail aria-hidden="true" className="size-5" />
          Open your email app
        </a>
      </div>
    </BottomSheet>
  )
}
