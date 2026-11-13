import { lazy } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { WelcomePage } from '@/features/auth/WelcomePage'
import { PublicOnly, RequireRole } from './guards'
import { PortalLayout } from './layouts/PortalLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { RootLayout } from './layouts/RootLayout'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorPage } from './pages/RouteErrorPage'

/**
 * Every screen in the app, in one place.
 *
 * Real pages are loaded with `lazy(() => import(...))`, so each screen's code
 * downloads only when someone opens it. Screens that a later phase delivers
 * are placeholders for now: the structure and access rules around them are real.
 */

// Public
const OwnerLoginPage = lazy(() => import('@/features/auth/OwnerLoginPage'))
const StaffLoginPage = lazy(() => import('@/features/auth/StaffLoginPage'))
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'))
const SuspendedPage = lazy(() => import('@/features/auth/SuspendedPage'))

// Selling (staff and owners)
const NewOrderPage = lazy(() => import('@/features/orders/NewOrderPage'))
const OrderSuccessPage = lazy(() => import('@/features/orders/OrderSuccessPage'))
const MyOrdersPage = lazy(() => import('@/features/orders/MyOrdersPage'))
const OrderDetailPage = lazy(() => import('@/features/orders/OrderDetailPage'))
const StaffItemsPage = lazy(() => import('@/features/items/StaffItemsPage'))
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'))

// Owner
const OwnerHomePage = lazy(() => import('@/features/business/OwnerHomePage'))
const OwnerOrdersPage = lazy(() => import('@/features/orders/OwnerOrdersPage'))
const OwnerItemsPage = lazy(() => import('@/features/items/OwnerItemsPage'))
const ItemFormPage = lazy(() => import('@/features/items/ItemFormPage'))
const ItemDetailPage = lazy(() => import('@/features/items/ItemDetailPage'))
const RestockPage = lazy(() => import('@/features/stock/RestockPage'))
const AdjustStockPage = lazy(() => import('@/features/stock/AdjustStockPage'))
const LedgerPage = lazy(() => import('@/features/stock/LedgerPage'))
const StaffListPage = lazy(() => import('@/features/staff/StaffListPage'))
const StaffDetailPage = lazy(() => import('@/features/staff/StaffDetailPage'))
const CreateStaffPage = lazy(() => import('@/features/staff/CreateStaffPage'))
const BusinessSettingsPage = lazy(() => import('@/features/settings/BusinessSettingsPage'))
const MorePage = lazy(() => import('@/features/settings/MorePage'))
const HelpPage = lazy(() => import('@/features/settings/HelpPage'))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'))

// Super-admin. Only downloaded after the guard has let the super-admin in.
const AdminBusinessesPage = lazy(() => import('@/features/admin/AdminBusinessesPage'))
const AdminBusinessDetailPage = lazy(() => import('@/features/admin/AdminBusinessDetailPage'))
const AdminCodesPage = lazy(() => import('@/features/admin/AdminCodesPage'))
const GenerateCodePage = lazy(() => import('@/features/admin/GenerateCodePage'))

// The design gallery is for development only. This import is removed from production builds.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/gallery',
        Component: lazy(() => import('@/features/dev/GalleryPage')),
      },
    ]
  : []

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      // Public screens. Signed-in people are redirected to their own home.
      {
        element: <PublicOnly />,
        children: [
          {
            element: <PublicLayout />,
            children: [
              { index: true, element: <WelcomePage /> },
              { path: 'login/owner', Component: OwnerLoginPage },
              { path: 'login/staff', Component: StaffLoginPage },
              { path: 'register', Component: RegisterPage },
              { path: 'forgot-password', Component: ForgotPasswordPage },
            ],
          },
        ],
      },
      {
        element: <PublicLayout />,
        children: [
          { path: 'suspended', element: <SuspendedPage fallbackReason="suspended" /> },
          { path: 'access-ended', element: <SuspendedPage fallbackReason="access_ended" /> },
          ...devRoutes,
        ],
      },

      // Staff portal: takes orders only.
      {
        path: 'staff',
        element: <RequireRole allow={['staff']} />,
        children: [
          {
            element: <PortalLayout portal="staff" />,
            children: [
              { index: true, element: <Navigate to="new-order" replace /> },
              { path: 'new-order', Component: NewOrderPage },
              { path: 'orders', Component: MyOrdersPage },
              { path: 'orders/:orderId', Component: OrderDetailPage },
              { path: 'orders/:orderId/done', Component: OrderSuccessPage },
              { path: 'items', Component: StaffItemsPage },
              { path: 'profile', Component: ProfilePage },
            ],
          },
        ],
      },

      // Owner portal: full control of one business.
      {
        path: 'owner',
        element: <RequireRole allow={['owner']} />,
        children: [
          {
            element: <PortalLayout portal="owner" />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', Component: OwnerHomePage },
              { path: 'new-order', Component: NewOrderPage },
              { path: 'orders', Component: OwnerOrdersPage },
              { path: 'orders/:orderId', Component: OrderDetailPage },
              { path: 'orders/:orderId/done', Component: OrderSuccessPage },
              { path: 'items', Component: OwnerItemsPage },
              { path: 'items/new', Component: ItemFormPage },
              { path: 'items/:itemId', Component: ItemDetailPage },
              { path: 'items/:itemId/edit', Component: ItemFormPage },
              { path: 'items/:itemId/adjust', Component: AdjustStockPage },
              { path: 'restock', Component: RestockPage },
              { path: 'ledger', Component: LedgerPage },
              { path: 'staff', Component: StaffListPage },
              { path: 'staff/new', Component: CreateStaffPage },
              { path: 'staff/:staffId', Component: StaffDetailPage },
              { path: 'settings', Component: BusinessSettingsPage },
              { path: 'reports', Component: ReportsPage },
              { path: 'more', Component: MorePage },
              { path: 'help', Component: HelpPage },
              { path: 'profile', Component: ProfilePage },
            ],
          },
        ],
      },

      // Super-admin area: hidden. Everyone else gets the normal "page not found".
      {
        path: 'admin',
        element: <RequireRole allow={['super_admin']} hidden />,
        children: [
          {
            element: <PortalLayout portal="admin" />,
            children: [
              { index: true, element: <Navigate to="businesses" replace /> },
              { path: 'businesses', Component: AdminBusinessesPage },
              { path: 'businesses/:businessId', Component: AdminBusinessDetailPage },
              { path: 'codes', Component: AdminCodesPage },
              { path: 'codes/new', Component: GenerateCodePage },
            ],
          },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
