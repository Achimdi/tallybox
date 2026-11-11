import { Link } from 'react-router'
import { Button } from '@/components/Button'
import { useSession, type Role } from '@/features/auth/session'

const ROLES: readonly { role: Role; label: string }[] = [
  { role: 'staff', label: 'Staff' },
  { role: 'owner', label: 'Owner' },
  { role: 'super_admin', label: 'Super-admin' },
]

/**
 * DEVELOPMENT ONLY. Lets you look at each role's layout before real sign-in
 * exists (Phase 1). It is never included in a production build.
 */
export default function DevRolePreview() {
  const { devSignIn } = useSession()
  if (!devSignIn) return null

  return (
    <aside
      aria-label="Development preview"
      className="flex flex-col gap-3 rounded-card border border-dashed border-line-control p-4"
    >
      <div className="flex flex-col">
        <p className="text-label text-ink">Development preview</p>
        <p className="text-label font-normal text-ink-muted">
          Not in the live app. Preview a role&apos;s layout, or open the{' '}
          <Link to="/dev/gallery" className="font-semibold text-primary underline">
            design gallery
          </Link>
          .
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ROLES.map(({ role, label }) => (
          <Button key={role} variant="secondary" onClick={() => devSignIn(role)}>
            {label}
          </Button>
        ))}
      </div>
    </aside>
  )
}
