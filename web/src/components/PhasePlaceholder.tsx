import { EmptyState } from './states'

interface PhasePlaceholderProps {
  title: string
  /** The build phase that delivers this screen. */
  phase: number
}

/** Stands in for a screen that a later build phase will deliver. */
export function PhasePlaceholder({ title, phase }: PhasePlaceholderProps) {
  return (
    <section aria-labelledby="placeholder-title" className="flex flex-col gap-2">
      <h1 id="placeholder-title" className="text-title-lg text-ink">
        {title}
      </h1>
      <EmptyState
        title="Not built yet"
        description={`This screen arrives in Phase ${phase}. The navigation, layout and access rules around it are already working.`}
      />
    </section>
  )
}
