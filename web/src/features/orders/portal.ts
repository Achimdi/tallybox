import type { Role } from '@/api/types'

/** Selling screens are shared by staff and owners; each has its own address prefix. */
export function portalBase(role: Role): '/staff' | '/owner' {
  return role === 'owner' ? '/owner' : '/staff'
}
