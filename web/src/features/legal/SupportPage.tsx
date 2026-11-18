import { Mail } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClasses } from '@/components/button-styles'
import { ContactLink, ContactProvider } from '@/features/landing/ContactSheet'
import { InstagramIcon } from '@/features/landing/InstagramIcon'
import { SUPPORT_INSTAGRAM } from '@/lib/config'
import { DocumentPage, DocumentSection } from './DocumentPage'

/** How to get help, and answers to the questions people ask before and after signing in. */
export default function SupportPage() {
  return (
    <ContactProvider>
      <DocumentPage
        title="Help and support"
        intro={<p>Answers to common questions, and how to reach us.</p>}
      >
        <DocumentSection id="contact" title="Get in touch">
          <p>Write to us about anything: help, an activation code, or your access period.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ContactLink reason="contact" className={buttonClasses({ size: 'lg' })}>
              <Mail aria-hidden="true" className="size-5" />
              Email us
            </ContactLink>
            <a
              href={SUPPORT_INSTAGRAM.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: 'secondary', size: 'lg' })}
            >
              <InstagramIcon className="size-5" />
              Message us on Instagram
            </a>
          </div>
        </DocumentSection>

        <DocumentSection id="start" title="Getting started">
          <ul>
            <li>
              <ContactLink reason="code" className="font-semibold text-primary underline">
                Ask us for an activation code
              </ContactLink>{' '}
              with your business name and your name.
            </li>
            <li>
              Register your business with it on <Link to="/register">Get started</Link>. Your email
              address must match the one the code is for.
            </li>
            <li>Add the items you sell, then create accounts for your staff in More, Staff.</li>
          </ul>
        </DocumentSection>

        <DocumentSection id="sign-in" title="Signing in">
          <ul>
            <li>
              <strong>Owners</strong> sign in on <Link to="/login/owner">Owner login</Link> with
              their email address.
            </li>
            <li>
              <strong>Staff</strong> sign in on <Link to="/login/staff">Staff login</Link> with the
              business code, their username and password. The owner gives them these.
            </li>
          </ul>
        </DocumentSection>

        <DocumentSection id="password" title="Forgot your password?">
          <ul>
            <li>
              <strong>Owners:</strong>{' '}
              <ContactLink reason="contact" className="font-semibold text-primary underline">
                contact us
              </ContactLink>{' '}
              from the email address you registered with. We check it is you, then send a one-time
              link. It works once, within an hour: open it and choose a new password.
            </li>
            <li>
              <strong>Staff:</strong> ask your business owner. They set a new password for you in
              More, Staff.
            </li>
          </ul>
        </DocumentSection>

        <DocumentSection id="access" title="Access, suspension and your records">
          <ul>
            <li>
              The owner sees a reminder when access ends within 7 days. To extend it,{' '}
              <ContactLink reason="contact" className="font-semibold text-primary underline">
                contact us
              </ContactLink>
              .
            </li>
            <li>
              If you see &quot;access has ended&quot; or &quot;this business is suspended&quot;,
              nobody in the business can sign in until it is sorted out, but your records are safe
              and nothing is deleted.
            </li>
            <li>
              Owners can download every order as a spreadsheet file from Reports. How we look after
              your data is explained in <Link to="/privacy">Privacy</Link>.
            </li>
          </ul>
        </DocumentSection>

        <DocumentSection id="security" title="Report a security problem">
          <p>
            If you think someone has got into an account, or you found a weakness in Tallybox,{' '}
            <ContactLink reason="contact" className="font-semibold text-primary underline">
              tell us straight away
            </ContactLink>
            . Owners can also turn off a staff account at once from More, Staff.
          </p>
        </DocumentSection>
      </DocumentPage>
    </ContactProvider>
  )
}
