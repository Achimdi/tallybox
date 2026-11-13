import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useApi } from '@/api/context'
import type { ReportRange } from '@/domain/salesReport'

/** The owner's sales report for a range. Keeps showing the last one while a new range loads. */
export function useSalesReport(range: ReportRange, enabled: boolean) {
  const api = useApi()
  return useQuery({
    queryKey: ['reports', 'summary', range],
    queryFn: () => api.reports.summary(range),
    placeholderData: keepPreviousData,
    enabled,
  })
}
