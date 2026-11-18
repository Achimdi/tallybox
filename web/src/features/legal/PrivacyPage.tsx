import { Link } from 'react-router'
import { ContactLink, ContactProvider } from '@/features/landing/ContactSheet'
import { SUPPORT_EMAIL, SUPPORT_INSTAGRAM } from '@/lib/config'
import { DocumentPage, DocumentSection } from './DocumentPage'

/** When this page last changed. Update it with every change to the text. */
export const PRIVACY_UPDATED = '18 November 2026'

/** What Tallybox keeps, why, where, for how long, and what people can ask for. */
export default function PrivacyPage() {
  return (
    <ContactProvider>
      <DocumentPage
        title="Privacy"
        intro={
          <>
            <p>
              Tallybox helps shops record their stock and sales. This page explains, in plain words,
              what information Tallybox keeps, why, where it is kept, and what you can ask us to do
              with it. Tallybox is run from Nigeria and follows the Nigeria Data Protection Act
              2023.
            </p>
            <p className="mt-2 text-label">Last updated {PRIVACY_UPDATED}.</p>
          </>
        }
      >
        <DocumentSection id="who" title="Who we are">
          <p>
            Tallybox. Write to us at{' '}
            <ContactLink reason="contact" className="font-semibold text-primary underline">
              {SUPPORT_EMAIL}
            </ContactLink>{' '}
            or message{' '}
            <a href={SUPPORT_INSTAGRAM.url} target="_blank" rel="noopener noreferrer">
              @{SUPPORT_INSTAGRAM.handle}
            </a>{' '}
            on Instagram about anything on this page.
          </p>
        </DocumentSection>

        <DocumentSection id="what" title="What Tallybox keeps">
          <ul>
            <li>
              <strong>Business owners:</strong> your name, email address, phone number (if you give
              one) and password. Passwords are stored only in a scrambled form that nobody can read,
              us included.
            </li>
            <li>
              <strong>Your business:</strong> its name, business code, address, phone number, logo,
              currency, time zone and receipt message.
            </li>
            <li>
              <strong>Staff accounts:</strong> each person&apos;s name and username, and when they
              last signed in.
            </li>
            <li>
              <strong>What you record:</strong> items, prices, cost prices, shared supplies,
              deliveries and suppliers, stock counts and the stock history; and orders, with who
              took them, how they were paid and any payment reference. A customer&apos;s name, phone
              number or a note is kept only if someone types it in.
            </li>
            <li>
              <strong>Security information:</strong> when accounts sign in, and counts of repeated
              attempts (kept in a scrambled form), so we can stop people guessing passwords or
              codes.
            </li>
          </ul>
        </DocumentSection>

        <DocumentSection id="why" title="Why">
          <ul>
            <li>
              To run the service you signed up for: sign-in, recording sales and stock, receipts and
              reports.
            </li>
            <li>To keep accounts and businesses secure, and to stop abuse.</li>
            <li>To manage your business&apos;s access period with you.</li>
          </ul>
          <p>
            We do not sell or rent anyone&apos;s information, show adverts, or use tracking or
            analytics tools.
          </p>
        </DocumentSection>

        <DocumentSection id="customers" title="Your customers">
          <p>
            When a shop records a customer&apos;s name or phone number on an order, the shop decides
            that and is responsible for it. Tallybox keeps it for the shop and uses it for nothing
            else. Customers who want it changed or removed should ask the shop, and we will help the
            shop do it.
          </p>
        </DocumentSection>

        <DocumentSection id="where" title="Where it is kept">
          <ul>
            <li>
              <strong>Supabase</strong> keeps the database, sign-ins and logos, in its data centre
              in Ireland (European Union).
            </li>
            <li>
              <strong>Cloudflare</strong> serves the website and runs the check that tells people
              from bots on the sign-in and registration pages. Like any website host, it sees the
              internet address of each visit.
            </li>
            <li>
              <strong>GitHub</strong> stores a weekly backup copy, locked with a passphrase so that
              GitHub cannot read it.
            </li>
          </ul>
          <p>
            This means your information is kept outside Nigeria, with providers that protect it
            under their own security and privacy terms.
          </p>
        </DocumentSection>

        <DocumentSection id="device" title="On your phone or computer">
          <p>
            The app keeps your sign-in, a random device code (used only to limit repeated attempts)
            and the order you are taking in your browser&apos;s storage. There are no advertising or
            tracking cookies. The demo keeps its made-up data only in the browser you use it in.
          </p>
        </DocumentSection>

        <DocumentSection id="how-long" title="How long we keep it">
          <p>
            For as long as your business has a Tallybox account. If its access ends, nothing is
            deleted, so you can carry on when it is extended, until the owner asks us to delete the
            business&apos;s data. Backup copies delete themselves after 90 days, so deleted
            information is gone from them within 90 days too.
          </p>
        </DocumentSection>

        <DocumentSection id="security" title="How it is protected">
          <ul>
            <li>Everything travels encrypted (HTTPS).</li>
            <li>
              Each business can see only its own records, and staff never see sales totals, cost
              prices, reports or settings.
            </li>
            <li>Passwords are scrambled, and sign-in and registration are protected from bots.</li>
            <li>Backups are encrypted before they are stored.</li>
          </ul>
        </DocumentSection>

        <DocumentSection id="rights" title="Your rights">
          <p>Under the Nigeria Data Protection Act 2023 you can ask us to:</p>
          <ul>
            <li>tell you what information we hold about you, and give you a copy;</li>
            <li>correct it;</li>
            <li>delete it;</li>
            <li>stop or limit using it, or object to how it is used;</li>
            <li>give it to you in a form you can take to another service;</li>
            <li>stop anything you gave consent for.</li>
          </ul>
          <p>
            Owners can correct most things themselves in Settings, and download their orders as a
            spreadsheet file from Reports. For anything else, write to{' '}
            <ContactLink reason="contact" className="font-semibold text-primary underline">
              {SUPPORT_EMAIL}
            </ContactLink>
            . If you are not happy with our answer, you can complain to the Nigeria Data Protection
            Commission (NDPC).
          </p>
        </DocumentSection>

        <DocumentSection id="changes" title="Changes to this page">
          <p>
            When this page changes, the date at the top changes too, and we let business owners know
            about important changes. Tallybox is a tool for businesses and is not meant for
            children.
          </p>
          <p>
            Need help with something else? See <Link to="/support">Support</Link>.
          </p>
        </DocumentSection>
      </DocumentPage>
    </ContactProvider>
  )
}
