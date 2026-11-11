import { ButtonLink } from '@/components/Button'
import { EmptyState } from '@/components/states'

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      <EmptyState
        headingLevel={1}
        title="Page not found"
        description="That link doesn't lead anywhere. Check the address or go back to the start."
        action={<ButtonLink to="/">Go to start</ButtonLink>}
      />
    </main>
  )
}
