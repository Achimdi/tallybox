import {
  ChartColumn,
  CirclePlus,
  Ellipsis,
  KeyRound,
  LayoutDashboard,
  Package,
  ReceiptText,
  Store,
  User,
} from 'lucide-react'
import type { NavItem } from '@/components/AppNav'
import type { Role } from '@/features/auth/session'

/** Each role has its own area of the app, and each area has its own navigation. */
export type Portal = 'staff' | 'owner' | 'admin'

export const PORTAL_FOR_ROLE: Record<Role, Portal> = {
  staff: 'staff',
  owner: 'owner',
  super_admin: 'admin',
}

const HOME: Record<Role, string> = {
  staff: '/staff/new-order',
  owner: '/owner/dashboard',
  super_admin: '/admin/businesses',
}

/** Where someone lands after signing in. */
export function homePathFor(role: Role): string {
  return HOME[role]
}

export const PORTAL_NAV: Record<Portal, readonly NavItem[]> = {
  staff: [
    { to: '/staff/new-order', label: 'New order', icon: CirclePlus },
    { to: '/staff/orders', label: 'My orders', icon: ReceiptText },
    { to: '/staff/items', label: 'Items', icon: Package },
    { to: '/staff/profile', label: 'Profile', icon: User },
  ],
  owner: [
    { to: '/owner/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/owner/orders', label: 'Orders', icon: ReceiptText },
    { to: '/owner/items', label: 'Items', icon: Package },
    { to: '/owner/reports', label: 'Reports', icon: ChartColumn },
    { to: '/owner/more', label: 'More', icon: Ellipsis },
  ],
  admin: [
    { to: '/admin/businesses', label: 'Businesses', icon: Store },
    { to: '/admin/codes', label: 'Codes', icon: KeyRound },
  ],
}
