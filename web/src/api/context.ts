import { createContext, useContext } from 'react'
import type { TallyboxApi } from './types'

export const ApiContext = createContext<TallyboxApi | null>(null)

/** The data layer. Screens use this and nothing else to read and change data. */
export function useApi(): TallyboxApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <Providers>')
  return api
}
