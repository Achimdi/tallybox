import { Ban, CalendarClock, CalendarX, KeyRound, Store, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AdminBusiness } from '@/api/types'
import { Button } from '@/components/Button'
import { FilterChips, type FilterOption } from '@/components/FilterChips'
import { ListGroup, ListItem } from '@/components/ListItem'
import { SearchBar } from '@/components/SearchBar'
import { SectionHeader } from '@/components/SectionHeader'
import { SkeletonList } from '@/components/Skeleton'
import { StatCard } from '@/components/StatCard'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusChip } from '@/components/StatusChip'
import { ResetDemoData } from '@/features/demo/ResetDemoData'
import { accessChip, formatDay } from './access'
import { useAdminBusinesses, usePlatformCounts } from './api'

type Filter = 'all' | 'active' | 'suspended' | 'ending_soon' | 'ended'

const FILTERS: Record<Filter, (business: AdminBusiness) => boolean> = {
  all: () => true,
  active: (business) => business.status === 'active' && business.accessFilter !== 'ended',
  suspended: (business) => business.status === 'suspended',
  ending_soon: (business) => business.accessFilter === 'ending_soon',
  ended: (business) => business.accessFilter === 'ended',
}

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  active: 'Active',
  suspended: 'Suspended',
  ending_soon: 'Ending soon',
  ended: 'Access ended',
}

function matchesSearch(business: AdminBusiness, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [
    business.name,
    business.businessCode,
    business.ownerEmail ?? '',
    business.ownerName ?? '',
  ].some((value) => value.toLowerCase().includes(needle))
}

/** Developer portal: every business, with filters and platform counts. */
export default function AdminBusinessesPage() {
  const businesses = useAdminBusinesses()
  const counts = usePlatformCounts()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const options = useMemo<FilterOption<Filter>[]>(
    () =>
      (Object.keys(FILTERS) as Filter[]).map((value) => ({
        value,
        label: FILTER_LABELS[value],
        ...(businesses.data ? { count: businesses.data.filter(FILTERS[value]).length } : {}),
      })),
    [businesses.data],
  )

  const shown = (businesses.data ?? []).filter(
    (business) => FILTERS[filter](business) && matchesSearch(business, search),
  )

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title-lg text-ink">Businesses</h1>

      <section
        aria-label="Platform counts"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      >
        <StatCard label="Businesses" icon={Store} value={counts.data?.businesses ?? '–'} />
        <StatCard label="Suspended" icon={Ban} value={counts.data?.suspended ?? '–'} />
        <StatCard label="Ending soon" icon={CalendarClock} value={counts.data?.endingSoon ?? '–'} />
        <StatCard label="Access ended" icon={CalendarX} value={counts.data?.accessEnded ?? '–'} />
        <StatCard label="Staff accounts" icon={Users} value={counts.data?.staff ?? '–'} />
        <StatCard label="Unused codes" icon={KeyRound} value={counts.data?.unusedCodes ?? '–'} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="All businesses" />
        <SearchBar
          value={search}
          onChange={setSearch}
          label="Search businesses"
          placeholder="Search by name, code or owner"
        />
        <FilterChips
          label="Filter businesses"
          options={options}
          value={filter}
          onChange={setFilter}
        />

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
        ) : shown.length === 0 ? (
          <div className="rounded-card border border-line bg-surface-raised">
            <EmptyState
              title="No businesses match"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter('all')
                    setSearch('')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <ListGroup>
            {shown.map((business) => {
              const access = accessChip(business)
              return (
                <ListItem
                  key={business.id}
                  wrap
                  to={`/admin/businesses/${business.id}`}
                  title={business.name}
                  subtitle={`${business.businessCode} · ${business.ownerEmail ?? 'no owner'} · since ${formatDay(business.createdAt)}`}
                  trailing={
                    <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
                      {business.status === 'suspended' ? <StatusChip status="suspended" /> : null}
                      <StatusChip status={access.status} label={access.label} />
                    </span>
                  }
                />
              )
            })}
          </ListGroup>
        )}
      </section>

      <div className="flex justify-center pt-2">
        <ResetDemoData />
      </div>
    </div>
  )
}
