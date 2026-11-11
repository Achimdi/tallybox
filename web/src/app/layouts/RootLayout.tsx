import { Outlet } from 'react-router'
import { OfflineBanner } from '@/components/OfflineBanner'
import { UpdatePrompt } from '@/components/UpdatePrompt'

/** Around every screen: the offline banner and the new-version prompt. */
export function RootLayout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      <UpdatePrompt />
    </>
  )
}
