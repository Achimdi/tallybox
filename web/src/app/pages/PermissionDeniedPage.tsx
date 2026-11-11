import { ButtonLink } from '@/components/Button'
import { PermissionDenied } from '@/components/states'
import { useSession } from '@/features/auth/session'
import { homePathFor } from '../paths'

export function PermissionDeniedPage() {
  const { session } = useSession()
  const home = session.status === 'signed_in' ? homePathFor(session.user.role) : '/'
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      <PermissionDenied
        headingLevel={1}
        description="This part of Tallybox isn't available for your account. Ask the business owner if you think it should be."
        action={<ButtonLink to={home}>Back to my screen</ButtonLink>}
      />
    </main>
  )
}
