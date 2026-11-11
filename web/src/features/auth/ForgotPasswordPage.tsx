import { Mail } from 'lucide-react'
import { ButtonLink } from '@/components/Button'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SUPPORT_EMAIL } from '@/lib/config'
import { AuthPage } from './AuthPage'

/**
 * v1 sends no email, so there is no automatic reset. This page says plainly
 * what to do instead. An email reset replaces it once custom SMTP is set up.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthPage title="Forgot your password?" subtitle="Here's how to get back in.">
      <section aria-labelledby="owner-reset" className="flex flex-col gap-3">
        <h2 id="owner-reset" className="text-title text-ink">
          If you own the business
        </h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-ink">
          <li>Contact Tallybox support from the email you registered with.</li>
          <li>We check it&apos;s you, then send you a one-time reset link.</li>
          <li>Open the link and choose a new password.</li>
        </ol>
        <ListGroup>
          <ListItem
            leading={<Mail aria-hidden="true" className="size-5" />}
            title={SUPPORT_EMAIL}
            subtitle="Tallybox support"
          />
        </ListGroup>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Tallybox password reset')}`}
          className="inline-flex min-h-12 items-center self-start text-label font-semibold text-primary underline"
        >
          Write to support
        </a>
      </section>

      <section aria-labelledby="staff-reset" className="flex flex-col gap-3">
        <h2 id="staff-reset" className="text-title text-ink">
          If you are staff
        </h2>
        <p className="text-body text-ink">
          Ask the business owner. They can set a new password for you from their Tallybox.
        </p>
      </section>

      <ButtonLink to="/login/owner" variant="secondary" fullWidth>
        Back to owner login
      </ButtonLink>
    </AuthPage>
  )
}
