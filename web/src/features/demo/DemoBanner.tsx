import { FlaskConical } from 'lucide-react'
import { useApi } from '@/api/context'

/**
 * Always visible in demo mode, so nobody mistakes demo data for real records.
 * It cannot be dismissed.
 */
export function DemoBanner() {
  const api = useApi()
  if (api.source !== 'mock') return null
  return (
    <div className="no-print flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-caption font-semibold text-amber-900">
      <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
      <span>Demo mode: data stays in this browser</span>
    </div>
  )
}
