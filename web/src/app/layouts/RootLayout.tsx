import { Outlet } from 'react-router'
import { OfflineBanner } from '@/components/OfflineBanner'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import { DemoBanner } from '@/features/demo/DemoBanner'

/** Around every screen: the demo-mode and offline banners, and the new-version prompt. */
export function RootLayout() {
  return (
    <>
      <DemoBanner />
      <OfflineBanner />
      <Outlet />
      <UpdatePrompt />
    </>
  )
}
