import { CirclePlus, LifeBuoy, ScrollText, Settings, Truck, User, Users } from 'lucide-react'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SectionHeader } from '@/components/SectionHeader'
import { StatusChip } from '@/components/StatusChip'
import { accessEndsSoon } from '@/domain/access'
import { useSessionUser } from '@/features/auth/session'
import { formatDate } from '@/lib/dates'

const icon = 'size-5'

/** The owner's menu for everything that isn't one of the main tabs. */
export default function MorePage() {
  const user = useSessionUser()
  const timezone = user.timezone ?? 'UTC'
  const endsOn = user.accessEndsAt ? new Date(user.accessEndsAt) : null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-title-lg text-ink">More</h1>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Shop" />
        <ListGroup>
          <ListItem
            to="/owner/new-order"
            leading={<CirclePlus aria-hidden="true" className={icon} />}
            title="New order"
            subtitle="Sell something yourself"
          />
          <ListItem
            to="/owner/restock"
            leading={<Truck aria-hidden="true" className={icon} />}
            title="Restock"
            subtitle="Record a delivery"
          />
          <ListItem
            to="/owner/ledger"
            leading={<ScrollText aria-hidden="true" className={icon} />}
            title="Stock ledger"
            subtitle="Every stock change, with who made it"
          />
          <ListItem
            to="/owner/staff"
            leading={<Users aria-hidden="true" className={icon} />}
            title="Staff"
            subtitle="Accounts, passwords, turn off"
          />
        </ListGroup>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Business" />
        <ListGroup>
          <ListItem
            to="/owner/settings"
            leading={<Settings aria-hidden="true" className={icon} />}
            title="Business settings"
            subtitle="Name, logo, currency, time zone, receipts"
          />
          <ListItem
            title="Access"
            subtitle={
              endsOn
                ? `Ends ${formatDate(endsOn, timezone)}. To extend it, contact the person who set up Tallybox for you.`
                : 'No end date'
            }
            wrap
            trailing={
              endsOn === null ? (
                <StatusChip status="open_ended" />
              ) : accessEndsSoon(user.accessEndsAt, new Date()) ? (
                <StatusChip status="ending_soon" />
              ) : (
                <StatusChip status="active" />
              )
            }
          />
        </ListGroup>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="You" />
        <ListGroup>
          <ListItem
            to="/owner/profile"
            leading={<User aria-hidden="true" className={icon} />}
            title="Profile"
            subtitle="Change your password, sign out"
          />
          <ListItem
            to="/owner/help"
            leading={<LifeBuoy aria-hidden="true" className={icon} />}
            title="Help"
            subtitle="How Tallybox works"
          />
        </ListGroup>
      </section>
    </div>
  )
}
