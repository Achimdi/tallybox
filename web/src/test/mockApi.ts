import { createMockApi, type MockApiOptions } from '@/api/mock/mockApi'
import { DEMO_PASSWORD } from '@/api/mock/seed'
import { memoryStorage, type KeyValueStorage } from '@/api/mock/store'
import type { TallyboxApi } from '@/api/types'

/**
 * A mock data layer for tests: in memory, no delay, always online, with a
 * clock that tests can move forward.
 */
export interface TestApi {
  api: TallyboxApi
  /** Data storage shared by every "browser" made from this test API. */
  storage: KeyValueStorage
  /** Another browser on the same data, with its own signed-in person. */
  otherBrowser: () => TallyboxApi
  advanceTime: (ms: number) => void
}

export function createTestApi(options: Partial<MockApiOptions> = {}): TestApi {
  const storage = memoryStorage()
  let offsetMs = 0
  const make = () =>
    createMockApi({
      storage,
      sessionStorage: memoryStorage(),
      delayMs: 0,
      isOnline: () => true,
      deviceId: () => 'test-device',
      now: () => new Date(Date.now() + offsetMs),
      ...options,
    })
  return {
    api: make(),
    storage,
    otherBrowser: make,
    advanceTime: (ms) => {
      offsetMs += ms
    },
  }
}

export const DEMO = {
  password: DEMO_PASSWORD,
  developer: { portal: 'owner' as const, email: 'dev@demo.tallybox.test', password: DEMO_PASSWORD },
  owner: { portal: 'owner' as const, email: 'owner@demo.tallybox.test', password: DEMO_PASSWORD },
  staff: {
    portal: 'staff' as const,
    businessCode: 'sunrise-demo',
    username: 'ada',
    password: DEMO_PASSWORD,
  },
}

/** A test API already signed in as one of the demo accounts. */
export async function signedInTestApi(
  account: keyof Omit<typeof DEMO, 'password'>,
): Promise<TestApi> {
  const test = createTestApi()
  const result = await test.api.auth.signIn(DEMO[account])
  if (result.kind !== 'user') throw new Error(`demo ${account} could not sign in`)
  return test
}
